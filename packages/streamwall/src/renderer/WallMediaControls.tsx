import { type JSX } from 'preact'
import { useCallback } from 'preact/hooks'
import {
  FaPause,
  FaPlay,
  FaSlidersH,
  FaVolumeDown,
  FaVolumeMute,
  FaVolumeUp,
} from 'react-icons/fa'
import type { WallAudioMode, WallControlCommand } from 'streamwall-shared'
import { styled } from 'styled-components'

const NEXT_AUDIO_MODE: Record<WallAudioMode, WallAudioMode> = {
  stage: 'muted',
  muted: 'unmuted',
  unmuted: 'stage',
}

export function nextWallAudioMode(mode: WallAudioMode): WallAudioMode {
  return NEXT_AUDIO_MODE[mode]
}

const AUDIO_MODE_LABEL: Record<WallAudioMode, string> = {
  stage: 'Stage',
  muted: 'Muted',
  unmuted: 'Unmuted',
}

function AudioModeIcon({ mode }: { mode: WallAudioMode }) {
  if (mode === 'muted') {
    return <FaVolumeMute />
  }
  if (mode === 'unmuted') {
    return <FaVolumeUp />
  }
  return <FaSlidersH />
}

export function WallMediaControls({
  viewId,
  isPaused,
  volume,
  audioMode,
  onControl,
}: {
  viewId: number
  isPaused: boolean
  volume: number
  audioMode: WallAudioMode
  onControl: (command: WallControlCommand) => void
}) {
  const handlePlaybackClick = useCallback(() => {
    onControl({
      type: 'set-wall-playback',
      viewId,
      paused: !isPaused,
    })
  }, [isPaused, onControl, viewId])

  const handleVolumeInput = useCallback<
    JSX.InputEventHandler<HTMLInputElement>
  >(
    (event) => {
      onControl({
        type: 'set-wall-volume',
        viewId,
        volume: Number(event.currentTarget.value),
      })
    },
    [onControl, viewId],
  )

  const handleAudioModeClick = useCallback(() => {
    onControl({
      type: 'set-wall-audio-mode',
      viewId,
      mode: nextWallAudioMode(audioMode),
    })
  }, [audioMode, onControl, viewId])

  const modeLabel = AUDIO_MODE_LABEL[audioMode]
  const nextModeLabel = AUDIO_MODE_LABEL[nextWallAudioMode(audioMode)]

  return (
    <ControlBar data-wall-media-controls data-testid="wall-media-controls">
      <ControlButton
        type="button"
        onClick={handlePlaybackClick}
        aria-label={isPaused ? 'Play stream' : 'Pause stream'}
        title={isPaused ? 'Play stream' : 'Pause stream'}
        $isActive={isPaused}
      >
        {isPaused ? <FaPlay /> : <FaPause />}
      </ControlButton>

      <VolumeGroup>
        <FaVolumeDown aria-hidden="true" />
        <VolumeSlider
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onInput={handleVolumeInput}
          aria-label="Stream volume"
          title={`Volume ${Math.round(volume * 100)}%`}
        />
      </VolumeGroup>

      <AudioModeButton
        type="button"
        onClick={handleAudioModeClick}
        aria-label={`Audio mode: ${modeLabel}`}
        title={`${modeLabel}: click for ${nextModeLabel}`}
        $mode={audioMode}
      >
        <AudioModeIcon mode={audioMode} />
        <ModeText>{modeLabel}</ModeText>
      </AudioModeButton>
    </ControlBar>
  )
}

const ControlBar = styled.div`
  position: absolute;
  left: 50%;
  bottom: clamp(5px, 4cqh, 18px);
  z-index: 100;
  display: flex;
  align-items: center;
  gap: clamp(4px, 1.5cqw, 10px);
  max-width: calc(100% - 12px);
  box-sizing: border-box;
  padding: clamp(4px, 1.8cqh, 9px);
  color: white;
  background: rgba(8, 10, 14, 0.84);
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: clamp(7px, 3cqh, 14px);
  box-shadow: 0 5px 22px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(14px);
  transform: translate(-50%, 5px);
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 120ms ease-out,
    transform 120ms ease-out;

  @media (hover: none) {
    opacity: 1;
    pointer-events: auto;
    transform: translate(-50%, 0);
  }
`

const ControlButton = styled.button<{ $isActive?: boolean }>`
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: clamp(27px, 12cqh, 42px);
  height: clamp(27px, 12cqh, 42px);
  padding: 0;
  color: white;
  background: ${({ $isActive }) =>
    $isActive ? 'rgba(239, 68, 68, 0.9)' : 'rgba(255, 255, 255, 0.11)'};
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: clamp(5px, 2cqh, 9px);
  cursor: pointer;

  &:hover,
  &:focus-visible {
    background: rgba(255, 255, 255, 0.22);
    outline: 2px solid rgba(255, 255, 255, 0.72);
    outline-offset: 1px;
  }

  svg {
    width: 42%;
    height: 42%;
  }
`

const VolumeGroup = styled.label`
  display: flex;
  align-items: center;
  gap: clamp(3px, 1cqw, 7px);
  min-width: 70px;

  > svg {
    flex: 0 0 auto;
    width: clamp(12px, 5cqh, 18px);
    height: clamp(12px, 5cqh, 18px);
  }

  @container (max-width: 250px) {
    min-width: 50px;

    > svg {
      display: none;
    }
  }
`

const VolumeSlider = styled.input`
  width: clamp(52px, 20cqw, 120px);
  min-width: 0;
  accent-color: #ef4444;
  cursor: pointer;
`

const AudioModeButton = styled(ControlButton)<{ $mode: WallAudioMode }>`
  width: auto;
  min-width: clamp(58px, 21cqw, 108px);
  gap: 0.4em;
  padding: 0 clamp(7px, 2.4cqw, 12px);
  background: ${({ $mode }) => {
    if ($mode === 'unmuted') {
      return 'rgba(22, 163, 74, 0.92)'
    }
    if ($mode === 'muted') {
      return 'rgba(220, 38, 38, 0.92)'
    }
    return 'rgba(59, 130, 246, 0.84)'
  }};

  svg {
    width: clamp(12px, 5cqh, 18px);
    height: clamp(12px, 5cqh, 18px);
  }

  @container (max-width: 250px) {
    min-width: clamp(27px, 12cqh, 42px);
    padding: 0;
  }
`

const ModeText = styled.span`
  font-size: clamp(9px, 4.5cqh, 13px);
  font-weight: 700;
  white-space: nowrap;

  @container (max-width: 250px) {
    display: none;
  }
`
