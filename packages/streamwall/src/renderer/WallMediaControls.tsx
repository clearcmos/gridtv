import { type JSX } from 'preact'
import { useCallback } from 'preact/hooks'
import {
  FaCompressArrowsAlt,
  FaExpandArrowsAlt,
  FaPause,
  FaPlay,
  FaVolumeDown,
  FaVolumeMute,
  FaVolumeUp,
} from 'react-icons/fa'
import type {
  WallAudioMode,
  WallControlCommand,
  WallFitMode,
} from 'streamwall-shared'
import { styled } from 'styled-components'

const NEXT_AUDIO_MODE: Record<WallAudioMode, WallAudioMode> = {
  muted: 'unmuted',
  unmuted: 'muted',
}

export function nextWallAudioMode(mode: WallAudioMode): WallAudioMode {
  return NEXT_AUDIO_MODE[mode]
}

const NEXT_FIT_MODE: Record<WallFitMode, WallFitMode> = {
  fit: 'fill',
  fill: 'fit',
}

export function nextWallFitMode(mode: WallFitMode): WallFitMode {
  return NEXT_FIT_MODE[mode]
}

const AUDIO_MODE_LABEL: Record<WallAudioMode, string> = {
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
  return <FaVolumeUp />
}

export function WallMediaControls({
  viewId,
  viewIdx,
  isPaused,
  volume,
  audioMode,
  fitMode,
  isVisible,
  onControl,
}: {
  viewId: number
  viewIdx: number
  isPaused: boolean
  volume: number
  audioMode: WallAudioMode
  fitMode: WallFitMode
  isVisible: boolean
  onControl: (command: WallControlCommand) => void
}) {
  const handlePlaybackClick = useCallback(() => {
    onControl({
      type: 'set-wall-playback',
      viewId,
      viewIdx,
      paused: !isPaused,
    })
  }, [isPaused, onControl, viewId, viewIdx])

  const handleVolumeInput = useCallback<
    JSX.InputEventHandler<HTMLInputElement>
  >(
    (event) => {
      onControl({
        type: 'set-wall-volume',
        viewId,
        viewIdx,
        volume: Number(event.currentTarget.value),
      })
    },
    [onControl, viewId, viewIdx],
  )

  const handleAudioModeClick = useCallback(() => {
    onControl({
      type: 'set-wall-audio-mode',
      viewId,
      viewIdx,
      mode: nextWallAudioMode(audioMode),
    })
  }, [audioMode, onControl, viewId, viewIdx])

  const handleFitModeClick = useCallback(() => {
    onControl({
      type: 'set-wall-fit-mode',
      viewId,
      viewIdx,
      mode: nextWallFitMode(fitMode),
    })
  }, [fitMode, onControl, viewId, viewIdx])

  const modeLabel = AUDIO_MODE_LABEL[audioMode]

  return (
    <ControlBar
      data-wall-media-controls
      data-no-tile-drag
      data-testid="wall-media-controls"
      draggable={false}
      $isVisible={isVisible}
    >
      <ControlButton
        type="button"
        onClick={handlePlaybackClick}
        aria-label={isPaused ? 'Play stream' : 'Pause stream'}
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
        />
      </VolumeGroup>

      <FitModeButton
        type="button"
        onClick={handleFitModeClick}
        aria-label={`Video fit: ${fitMode === 'fit' ? 'Fit' : 'Fill'}`}
        $mode={fitMode}
      >
        {fitMode === 'fit' ? <FaCompressArrowsAlt /> : <FaExpandArrowsAlt />}
        <ModeText>{fitMode === 'fit' ? 'Fit' : 'Fill'}</ModeText>
      </FitModeButton>

      <AudioModeButton
        type="button"
        onClick={handleAudioModeClick}
        aria-label={`Audio mode: ${modeLabel}`}
        $mode={audioMode}
      >
        <AudioModeIcon mode={audioMode} />
        <ModeText>{modeLabel}</ModeText>
      </AudioModeButton>
    </ControlBar>
  )
}

const ControlBar = styled.div<{ $isVisible: boolean }>`
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
  transform: translate(-50%, ${({ $isVisible }) => ($isVisible ? 0 : 5)}px);
  opacity: ${({ $isVisible }) => ($isVisible ? 1 : 0)};
  pointer-events: ${({ $isVisible }) => ($isVisible ? 'auto' : 'none')};
  transition:
    opacity 120ms ease-out,
    transform 120ms ease-out;
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
    return 'rgba(220, 38, 38, 0.92)'
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

const FitModeButton = styled(ControlButton)<{ $mode: WallFitMode }>`
  width: auto;
  min-width: clamp(48px, 17cqw, 82px);
  gap: 0.4em;
  padding: 0 clamp(7px, 2.4cqw, 12px);
  background: ${({ $mode }) =>
    $mode === 'fit' ? 'rgba(37, 99, 235, 0.9)' : 'rgba(124, 58, 237, 0.9)'};

  svg {
    width: clamp(12px, 5cqh, 18px);
    height: clamp(12px, 5cqh, 18px);
  }

  @container (max-width: 300px) {
    min-width: clamp(27px, 12cqh, 42px);
    padding: 0;
  }
`

const ModeText = styled.span`
  font-size: clamp(9px, 4.5cqh, 13px);
  font-weight: 700;
  white-space: nowrap;

  @container (max-width: 300px) {
    display: none;
  }
`
