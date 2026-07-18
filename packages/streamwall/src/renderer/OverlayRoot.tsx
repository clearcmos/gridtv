import { useEffect, useState } from 'preact/hooks'
import { FaEdit, FaPlus, FaVideoSlash } from 'react-icons/fa'
import {
  computeLiveTileLayout,
  StreamwallState,
  twitchLoginFromInput,
  type LiveWallSlotState,
  type TwitchChannelSuggestion,
  type ViewPos,
  type ViewState,
  type WallControlCommand,
} from 'streamwall-shared'
import { styled } from 'styled-components'
import { matchesState } from 'xstate'
import packageInfo from '../../package.json'
import { GridSizeMenu } from './GridSizeMenu'
import { LAYER_FRAME_SANDBOX } from './layerFrameSandbox'
import { OverlayViewTile } from './OverlayViewTile'
import { StreamPickerDialog } from './StreamPickerDialog'
import { WallMediaControls } from './WallMediaControls'

// Extracted from overlay.tsx so it can be rendered and tested in isolation,
// without pulling in the module-level `render(<App />, document.body)` call.
export function Overlay({
  config,
  views,
  streams,
  wallSlots = [],
  fullscreenViewIdx,
  onControl,
  onSearchTwitch = async () => [],
  gridMenuShortcut = 0,
  fullscreenExitShortcut = 0,
}: Pick<
  StreamwallState,
  'config' | 'views' | 'streams' | 'wallSlots' | 'fullscreenViewIdx'
> & {
  onControl: (command: WallControlCommand) => void
  onSearchTwitch?: (query: string) => Promise<TwitchChannelSuggestion[]>
  gridMenuShortcut?: number
  fullscreenExitShortcut?: number
}) {
  const { width, height, activeColor } = config
  const tileCount = config.tileCount ?? config.cols * config.rows
  const [isGridMenuOpen, setGridMenuOpen] = useState(false)
  const [pickerViewIdx, setPickerViewIdx] = useState<number | null>(null)
  const [dragSourceViewIdx, setDragSourceViewIdx] = useState<number | null>(
    null,
  )
  const [dropTargetViewIdx, setDropTargetViewIdx] = useState<number | null>(
    null,
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F1') {
        event.preventDefault()
        setPickerViewIdx(null)
        setGridMenuOpen((open) => !open)
      } else if (event.key === 'Escape') {
        if (isGridMenuOpen) {
          event.preventDefault()
          setGridMenuOpen(false)
        } else if (pickerViewIdx == null && fullscreenViewIdx != null) {
          event.preventDefault()
          onControl({
            type: 'set-wall-fullscreen',
            viewIdx: fullscreenViewIdx,
            fullscreen: false,
          })
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [fullscreenViewIdx, isGridMenuOpen, onControl, pickerViewIdx])

  useEffect(() => {
    if (gridMenuShortcut > 0) {
      setPickerViewIdx(null)
      setGridMenuOpen((open) => !open)
    }
  }, [gridMenuShortcut])

  useEffect(() => {
    if (fullscreenExitShortcut > 0 && fullscreenViewIdx != null) {
      onControl({
        type: 'set-wall-fullscreen',
        viewIdx: fullscreenViewIdx,
        fullscreen: false,
      })
    }
  }, [fullscreenExitShortcut, fullscreenViewIdx, onControl])

  // Keep error views on the wall (instead of leaving a silent black cell) so the
  // failure and its reason are visible; they are rendered as an error tile below.
  const activeViews = views.filter(({ state }) =>
    matchesState('displaying', state),
  )
  const overlays = streams.filter((s) => s.kind === 'overlay')

  const viewsBySpace = new Map<number, ViewState>()
  for (const view of activeViews) {
    for (const space of view.context.pos?.spaces ?? []) {
      viewsBySpace.set(space, view)
    }
  }
  const wallSlotsBySpace = new Map<number, LiveWallSlotState>(
    wallSlots.map((slot) => [slot.viewIdx, slot]),
  )

  function renderTile(
    viewIdx: number,
    pos: ViewPos,
    view?: ViewState,
    wallSlot?: LiveWallSlotState,
  ) {
    const { state, context } = view ?? {
      state: 'empty' as const,
      context: null,
    }
    const content = context?.content
    const assignedData = wallSlot?.streamId
      ? streams.find((stream) => stream._id === wallSlot.streamId)
      : undefined
    const data = content
      ? streams.find((stream) => content.url === stream.link)
      : assignedData
    const isError = view ? matchesState('displaying.error', state) : false
    const wallAudioMode = context?.wallAudioMode ?? 'muted'
    const isAudible = wallAudioMode === 'unmuted'
    const isBlurred = view
      ? matchesState('displaying.running.video.blurred', state)
      : false
    const isLoading = view
      ? matchesState('displaying.loading', state) ||
        matchesState('displaying.running.playback.stalled', state)
      : false
    const hasAssignment = Boolean(content || wallSlot?.streamId)
    const statusLabel = data?.label ?? data?.source ?? 'This channel'

    const interactiveTarget = (target: EventTarget | null) =>
      target instanceof Element &&
      target.closest('button, input, [role="dialog"]') != null

    return (
      <SpaceBorder
        key={viewIdx}
        data-wall-tile
        data-view-idx={viewIdx}
        $pos={pos}
        $windowWidth={width}
        $windowHeight={height}
        $activeColor={activeColor}
        $isListening={isAudible}
        $isError={isError}
        $isDragging={dragSourceViewIdx === viewIdx}
        $isDropTarget={dropTargetViewIdx === viewIdx}
        draggable={fullscreenViewIdx == null}
        title={
          view
            ? 'Double-click to expand; drag to another tile to swap'
            : 'Drag to another tile to swap'
        }
        onDblClick={(event) => {
          if (!view || !content || interactiveTarget(event.target)) {
            return
          }
          onControl({
            type: 'set-wall-fullscreen',
            viewIdx,
            fullscreen: fullscreenViewIdx == null,
          })
        }}
        onDragStart={(event) => {
          if (
            fullscreenViewIdx != null ||
            interactiveTarget(event.target) ||
            !event.dataTransfer
          ) {
            event.preventDefault()
            return
          }
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData('text/plain', String(viewIdx))
          setDragSourceViewIdx(viewIdx)
          setDropTargetViewIdx(null)
        }}
        onDragEnter={(event) => {
          if (dragSourceViewIdx != null && dragSourceViewIdx !== viewIdx) {
            event.preventDefault()
            setDropTargetViewIdx(viewIdx)
          }
        }}
        onDragOver={(event) => {
          if (dragSourceViewIdx != null && dragSourceViewIdx !== viewIdx) {
            event.preventDefault()
            if (event.dataTransfer) {
              event.dataTransfer.dropEffect = 'move'
            }
          }
        }}
        onDrop={(event) => {
          event.preventDefault()
          const transferredText =
            event.dataTransfer?.getData('text/plain') ?? ''
          const transferred = /^\d+$/.test(transferredText)
            ? Number(transferredText)
            : null
          const fromViewIdx =
            dragSourceViewIdx ??
            (transferred != null && Number.isInteger(transferred)
              ? transferred
              : null)
          if (fromViewIdx != null && fromViewIdx !== viewIdx) {
            onControl({
              type: 'swap-wall-streams',
              fromViewIdx,
              toViewIdx: viewIdx,
            })
          }
          setDragSourceViewIdx(null)
          setDropTargetViewIdx(null)
        }}
        onDragEnd={() => {
          setDragSourceViewIdx(null)
          setDropTargetViewIdx(null)
        }}
      >
        {content && (
          <OverlayViewTile
            url={content.url}
            data={data}
            isError={isError}
            errorReason={context?.error}
            isBlurred={isBlurred}
            isLoading={isLoading}
          />
        )}
        {!content && assignedData && (
          <UnavailableTile
            data-testid={
              wallSlot?.twitchStatus === 'offline'
                ? 'offline-tile'
                : 'unavailable-tile'
            }
            role="status"
          >
            {wallSlot?.twitchStatus === 'offline' && <FaVideoSlash />}
            <strong>{statusLabel}</strong>
            <span>
              {wallSlot?.twitchStatus === 'offline'
                ? 'Offline'
                : wallSlot?.twitchStatus === 'unknown'
                  ? 'Status unavailable'
                  : wallSlot?.twitchStatus === 'online'
                    ? 'Starting stream…'
                    : 'Checking live status…'}
            </span>
          </UnavailableTile>
        )}
        {!content && !assignedData && (
          <EmptyTile>
            <span>Empty tile {viewIdx + 1}</span>
          </EmptyTile>
        )}
        {view && context && (
          <WallMediaControls
            viewId={context.id}
            viewIdx={viewIdx}
            isPaused={context.isPaused ?? false}
            volume={context.volume}
            audioMode={wallAudioMode}
            onControl={onControl}
          />
        )}
        <TilePickerButton
          data-wall-tile-picker
          type="button"
          aria-label={`Choose stream for tile ${viewIdx + 1}`}
          title={`Choose stream for tile ${viewIdx + 1}`}
          $empty={!hasAssignment}
          draggable={false}
          onClick={() => {
            setGridMenuOpen(false)
            setPickerViewIdx(viewIdx)
          }}
        >
          {hasAssignment ? <FaEdit /> : <FaPlus />}
        </TilePickerButton>
      </SpaceBorder>
    )
  }

  const normalTiles = computeLiveTileLayout(tileCount, width, height).map(
    (pos) => {
      const viewIdx = pos.spaces[0]
      return renderTile(
        viewIdx,
        pos,
        viewsBySpace.get(viewIdx),
        wallSlotsBySpace.get(viewIdx),
      )
    },
  )
  const fullscreenTiles = activeViews.flatMap((view) => {
    const { pos } = view.context
    if (!pos) {
      return []
    }
    const viewIdx = fullscreenViewIdx ?? pos.spaces[0] ?? 0
    return [renderTile(viewIdx, pos, view, wallSlotsBySpace.get(viewIdx))]
  })

  const pickerView =
    pickerViewIdx == null ? undefined : viewsBySpace.get(pickerViewIdx)
  const pickerSlot =
    pickerViewIdx == null ? undefined : wallSlotsBySpace.get(pickerViewIdx)
  const pickerAssignedStream = pickerSlot?.streamId
    ? streams.find((stream) => stream._id === pickerSlot.streamId)
    : undefined
  const pickerURL =
    pickerView?.context.content?.url ?? pickerAssignedStream?.link
  const pickerInitialValue = pickerURL
    ? (twitchLoginFromInput(pickerURL) ?? '')
    : ''

  return (
    <OverlayContainer>
      <VersionFooter />
      {fullscreenViewIdx == null ? normalTiles : fullscreenTiles}
      {overlays.map((s) => (
        <OverlayIFrame
          key={s._id}
          src={s.link}
          sandbox={LAYER_FRAME_SANDBOX}
          allow="autoplay"
          scrolling="no"
        />
      ))}
      {isGridMenuOpen && (
        <GridSizeMenu
          currentCount={tileCount}
          onSelect={(count) => {
            onControl({ type: 'set-wall-tile-count', count })
            setGridMenuOpen(false)
          }}
          onClose={() => setGridMenuOpen(false)}
        />
      )}
      {pickerViewIdx != null && (
        <StreamPickerDialog
          viewIdx={pickerViewIdx}
          initialValue={pickerInitialValue}
          onSearch={onSearchTwitch}
          onSubmit={(username) => {
            onControl({
              type: 'set-wall-stream',
              viewIdx: pickerViewIdx,
              username,
            })
            setPickerViewIdx(null)
          }}
          onClose={() => setPickerViewIdx(null)}
        />
      )}
    </OverlayContainer>
  )
}

function VersionFooter() {
  const [isShowing, setShowing] = useState(false)
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined = undefined
    const interval = setInterval(() => {
      setShowing(true)
      timeout = setTimeout(() => {
        setShowing(false)
      }, 5000)
    }, 30 * 1000)
    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [])
  return (
    <VersionText $isShowing={isShowing}>
      <strong>streamwall</strong> {packageInfo.version}
    </VersionText>
  )
}

const OverlayContainer = styled.div`
  overflow: hidden;
  pointer-events: none;
`

const SpaceBorder = styled.div.attrs<{
  $pos: ViewPos
  $windowWidth: number
  $windowHeight: number
  $activeColor: string
  $isListening: boolean
  $isError?: boolean
  $isDragging: boolean
  $isDropTarget: boolean
  $borderWidth?: number
}>(() => ({
  $borderWidth: 2,
}))`
  display: flex;
  align-items: flex-start;
  position: fixed;
  left: ${({ $pos }) => $pos.x}px;
  top: ${({ $pos }) => $pos.y}px;
  width: ${({ $pos }) => $pos.width}px;
  height: ${({ $pos }) => $pos.height}px;
  border: 0 solid ${({ $isError }) => ($isError ? 'red' : 'black')};
  border-left-width: ${({ $pos, $borderWidth }) =>
    $pos.x === 0 ? 0 : $borderWidth}px;
  border-right-width: ${({ $pos, $borderWidth, $windowWidth }) =>
    $pos.x + $pos.width === $windowWidth ? 0 : $borderWidth}px;
  border-top-width: ${({ $pos, $borderWidth }) =>
    $pos.y === 0 ? 0 : $borderWidth}px;
  border-bottom-width: ${({ $pos, $borderWidth, $windowHeight }) =>
    $pos.y + $pos.height === $windowHeight ? 0 : $borderWidth}px;
  box-shadow: ${({ $isListening, $activeColor, $isDropTarget }) =>
    [
      $isListening ? `0 0 10px ${$activeColor} inset` : '',
      $isDropTarget ? '0 0 0 5px rgba(167, 139, 250, 0.95) inset' : '',
    ]
      .filter(Boolean)
      .join(', ') || 'none'};
  box-sizing: border-box;
  container-type: size;
  pointer-events: auto;
  user-select: none;
  cursor: ${({ $isDragging }) => ($isDragging ? 'grabbing' : 'grab')};
  opacity: ${({ $isDragging }) => ($isDragging ? 0.62 : 1)};
  transition:
    box-shadow 100ms ease-out,
    opacity 100ms ease-out;

  &:hover [data-wall-media-controls],
  &:focus-within [data-wall-media-controls] {
    opacity: 1;
    pointer-events: auto;
    transform: translate(-50%, 0);
  }

  &:hover [data-wall-tile-picker],
  &:focus-within [data-wall-tile-picker] {
    opacity: 1;
    pointer-events: auto;
  }
`

const EmptyTile = styled.div`
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.025);
  font-size: clamp(10px, 5cqh, 16px);
  font-weight: 600;
  letter-spacing: 0.03em;
`

const UnavailableTile = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(4px, 2cqh, 10px);
  padding: clamp(8px, 4cqh, 24px);
  box-sizing: border-box;
  color: rgba(255, 255, 255, 0.9);
  text-align: center;
  background: rgba(11, 14, 20, 0.94);

  > svg {
    width: clamp(22px, 15cqh, 58px);
    height: clamp(22px, 15cqh, 58px);
    color: #7c8491;
  }

  > strong {
    max-width: 90%;
    overflow: hidden;
    font-size: clamp(12px, 8cqh, 26px);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  > span {
    color: #9ca3af;
    font-size: clamp(10px, 5cqh, 15px);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
`

const TilePickerButton = styled.button<{ $empty: boolean }>`
  position: absolute;
  top: clamp(5px, 3cqh, 12px);
  right: clamp(5px, 3cqh, 12px);
  z-index: 120;
  display: grid;
  place-items: center;
  width: clamp(27px, 11cqh, 40px);
  height: clamp(27px, 11cqh, 40px);
  padding: 0;
  color: white;
  background: rgba(8, 10, 14, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: clamp(5px, 2cqh, 9px);
  box-shadow: 0 3px 14px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(12px);
  opacity: ${({ $empty }) => ($empty ? 0.68 : 0)};
  pointer-events: ${({ $empty }) => ($empty ? 'auto' : 'none')};
  cursor: pointer;
  transition: opacity 120ms ease-out;

  &:hover,
  &:focus-visible {
    opacity: 1;
    background: rgba(145, 71, 255, 0.9);
    outline: 2px solid white;
    outline-offset: 1px;
  }

  svg {
    width: 42%;
    height: 42%;
  }
`

const VersionText = styled.div<{ $isShowing: boolean }>`
  position: fixed;
  bottom: 4px;
  right: 4px;
  color: white;
  font-size: 12px;
  text-shadow:
    0 0 1px rgba(0, 0, 0, 0.5),
    1px 0 1px rgba(0, 0, 0, 0.5),
    0 1px 1px rgba(0, 0, 0, 0.5),
    1px 1px 1px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(30px);
  padding: 1px 4px;
  border-bottom-left-radius: 4px;
  opacity: ${({ $isShowing }) => ($isShowing ? '.65' : '.35')};
  transition: ease-out 500ms all;
  pointer-events: none;
`

const OverlayIFrame = styled.iframe`
  position: fixed;
  left: 0;
  top: 0;
  width: 100vw;
  height: 100vh;
  border: none;
  pointer-events: none;
`
