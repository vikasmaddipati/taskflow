import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoiceAssistantHUD } from '../components/voice/VoiceAssistantHUD';

describe('VoiceAssistantHUD Component', () => {
  it('displays listening state, spoken response, and toggles wake mode', async () => {
    const user = userEvent.setup();
    const onToggleWakeMode = vi.fn();
    const onOpenHelp = vi.fn();

    render(
      <VoiceAssistantHUD
        voiceState="listening"
        isWakeMode={true}
        isAwake={false}
        partialText="Task Flow create task"
        lastTranscript=""
        lastResponse="Task is created: Buy milk."
        errorMessage=""
        isHelpOpen={false}
        onToggleSingleListen={vi.fn()}
        onToggleWakeMode={onToggleWakeMode}
        onCloseHelp={vi.fn()}
        onOpenHelp={onOpenHelp}
        onDismissResponse={vi.fn()}
        onRunExampleCommand={vi.fn()}
      />
    );

    expect(screen.getByText('Say "Mate" + command...')).toBeInTheDocument();
    expect(screen.getByText('Task Flow create task')).toBeInTheDocument();
    expect(screen.getByText('Task is created: Buy milk.')).toBeInTheDocument();

    await user.click(screen.getByText('Wake ON'));
    expect(onToggleWakeMode).toHaveBeenCalledTimes(1);

    await user.click(screen.getByLabelText('Voice command guide'));
    expect(onOpenHelp).toHaveBeenCalledTimes(1);
  });

  it('executes example command when clicked in help modal', async () => {
    const user = userEvent.setup();
    const onRunExampleCommand = vi.fn();
    const onCloseHelp = vi.fn();

    render(
      <VoiceAssistantHUD
        voiceState="idle"
        isWakeMode={false}
        isAwake={false}
        partialText=""
        lastTranscript=""
        lastResponse=""
        errorMessage=""
        isHelpOpen={true}
        onToggleSingleListen={vi.fn()}
        onToggleWakeMode={vi.fn()}
        onCloseHelp={onCloseHelp}
        onOpenHelp={vi.fn()}
        onDismissResponse={vi.fn()}
        onRunExampleCommand={onRunExampleCommand}
      />
    );

    const exampleBtn = screen.getByText(/Mate, schedule a task name PYTHON/i);
    await user.click(exampleBtn);

    expect(onRunExampleCommand).toHaveBeenCalledWith(
      'Mate, schedule a task name PYTHON'
    );
    expect(onCloseHelp).toHaveBeenCalledTimes(1);
  });
});
