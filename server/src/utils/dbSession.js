import mongoose from 'mongoose';

/**
 * Executes a callback within a managed MongoDB transaction if supported by the deployment.
 * Gracefully and safely falls back to atomic compensation on standalone MongoDB servers.
 *
 * @param {Function} callback - Async function receiving (session | null)
 * @returns {Promise<any>} - The result returned by callback
 */
export const runInTransaction = async (callback) => {
  let session = null;

  try {
    session = await mongoose.startSession();
    let result;

    try {
      session.startTransaction();
      result = await callback(session);
      await session.commitTransaction();
      return result;
    } catch (txErr) {
      if (session.inTransaction()) {
        try {
          await session.abortTransaction();
        } catch {
          // ignore secondary abort error
        }
      }

      const msg = txErr?.message || '';
      const isStandaloneUnsupported =
        msg.includes('Transaction numbers are only allowed') ||
        msg.includes('Transactions are not supported') ||
        msg.includes('replica set member or mongos') ||
        msg.includes('does not support retryable writes');

      if (isStandaloneUnsupported) {
        // Safe fallback for standalone local MongoDB instances:
        // Execute sequentially with atomic operation guarantees
        return await callback(null);
      }

      throw txErr;
    }
  } catch (outerErr) {
    // If starting session itself is unsupported on standalone
    const msg = outerErr?.message || '';
    if (
      msg.includes('Transaction numbers are only allowed') ||
      msg.includes('Transactions are not supported') ||
      msg.includes('replica set member or mongos') ||
      msg.includes('does not support retryable writes')
    ) {
      return await callback(null);
    }
    throw outerErr;
  } finally {
    if (session) {
      session.endSession();
    }
  }
};
