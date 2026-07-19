import {
  computeLiveTileLayout,
  computeLiveTileSpanSpaces,
  mergeLiveTilePositions,
  StreamwallState,
  twitchLoginFromInput,
  type LiveWallSlotState,
  type TwitchChannelSuggestion,
  type ViewPos,
  type ViewState,
  type WallControlCommand,
  type WallFitMode,
} from 'gridtv-shared'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { FaEdit, FaPlus, FaVideoSlash } from 'react-icons/fa'
import { styled } from 'styled-components'
import { matchesState } from 'xstate'
import packageInfo from '../../package.json'
import { GridSizeMenu } from './GridSizeMenu'
import { LAYER_FRAME_SANDBOX } from './layerFrameSandbox'
import { OverlayViewTile } from './OverlayViewTile'
import { StreamPickerDialog } from './StreamPickerDialog'
import { WallMediaControls } from './WallMediaControls'

/** Matches familiar video-player UX without making controls feel twitchy. */
export const WALL_CHROME_IDLE_MS = 2500

/** A mixed wall normalizes to Fill first; a uniformly filled wall cycles to Fit. */
export function nextWallFitModeForViews(
  views: readonly ViewState[],
): WallFitMode {
  const activeViews = views.filter(({ state }) =>
    matchesState('displaying', state),
  )
  return activeViews.every(
    ({ context }) => (context.wallFitMode ?? 'fill') === 'fill',
  )
    ? 'fit'
    : 'fill'
}

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
  fitModeShortcut = 0,
  fullscreenExitShortcut = 0,
}: Pick<
  StreamwallState,
  'config' | 'views' | 'streams' | 'wallSlots' | 'fullscreenViewIdx'
> & {
  onControl: (command: WallControlCommand) => void
  onSearchTwitch?: (query: string) => Promise<TwitchChannelSuggestion[]>
  gridMenuShortcut?: number
  fitModeShortcut?: number
  fullscreenExitShortcut?: number
}) {
  const { width, height } = config
  const tileCount = config.tileCount ?? config.cols * config.rows
  const baseLayout = computeLiveTileLayout(tileCount, width, height)
  const [isGridMenuOpen, setGridMenuOpen] = useState(false)
  const [pickerViewIdx, setPickerViewIdx] = useState<number | null>(null)
  const [dragSourceViewIdx, setDragSourceViewIdx] = useState<number | null>(
    null,
  )
  const [resizeSourceViewIdx, setResizeSourceViewIdx] = useState<number | null>(
    null,
  )
  const [resizeTargetViewIdx, setResizeTargetViewIdx] = useState<number | null>(
    null,
  )
  const [visibleChromeViewIdx, setVisibleChromeViewIdx] = useState<
    number | null
  >(null)
  const chromeIdleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  const tileGesture = useRef<{
    kind: 'swap' | 'resize'
    pointerId: number
    sourceViewIdx: number
    startX: number
    startY: number
    moved: boolean
    targetViewIdx: number | null
  } | null>(null)
  const suppressDoubleClickUntil = useRef(0)
  const lastFitModeShortcut = useRef(0)

  const cycleWallFitMode = useCallback(() => {
    if (fullscreenViewIdx != null) {
      return
    }
    onControl({
      type: 'set-wall-fit-mode-all',
      mode: nextWallFitModeForViews(views),
    })
  }, [fullscreenViewIdx, onControl, views])

  const clearChromeIdleTimer = () => {
    clearTimeout(chromeIdleTimer.current)
    chromeIdleTimer.current = undefined
  }

  const showTileChrome = (viewIdx: number) => {
    clearChromeIdleTimer()
    setVisibleChromeViewIdx(viewIdx)
    chromeIdleTimer.current = setTimeout(() => {
      setVisibleChromeViewIdx((current) =>
        current === viewIdx ? null : current,
      )
      chromeIdleTimer.current = undefined
    }, WALL_CHROME_IDLE_MS)
  }

  const hideTileChrome = (viewIdx: number) => {
    clearChromeIdleTimer()
    setVisibleChromeViewIdx((current) => (current === viewIdx ? null : current))
  }

  useEffect(() => () => clearChromeIdleTimer(), [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F1') {
        event.preventDefault()
        setPickerViewIdx(null)
        setGridMenuOpen((open) => !open)
      } else if (event.key === 'F2' && fullscreenViewIdx == null) {
        event.preventDefault()
        cycleWallFitMode()
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
  }, [
    cycleWallFitMode,
    fullscreenViewIdx,
    isGridMenuOpen,
    onControl,
    pickerViewIdx,
  ])

  useEffect(() => {
    if (gridMenuShortcut > 0) {
      setPickerViewIdx(null)
      setGridMenuOpen((open) => !open)
    }
  }, [gridMenuShortcut])

  useEffect(() => {
    if (fitModeShortcut > lastFitModeShortcut.current) {
      lastFitModeShortcut.current = fitModeShortcut
      cycleWallFitMode()
    }
  }, [cycleWallFitMode, fitModeShortcut])

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

  const baseSpaceAtPoint = (clientX: number, clientY: number) =>
    baseLayout.find(
      (pos) =>
        clientX >= pos.x &&
        clientX < pos.x + pos.width &&
        clientY >= pos.y &&
        clientY < pos.y + pos.height,
    )?.spaces[0]

  const clearTileGesture = () => {
    tileGesture.current = null
    setDragSourceViewIdx(null)
    setResizeSourceViewIdx(null)
    setResizeTargetViewIdx(null)
  }

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
    const isBlurred = view
      ? matchesState('displaying.running.video.blurred', state)
      : false
    const isLoading = view
      ? matchesState('displaying.loading', state) ||
        matchesState('displaying.running.playback.stalled', state)
      : false
    const hasAssignment = Boolean(content || wallSlot?.streamId)
    const statusLabel = data?.label ?? data?.source ?? 'This channel'
    const username =
      twitchLoginFromInput(content?.url ?? data?.link ?? '') ?? statusLabel

    const interactiveTarget = (target: EventTarget | null) =>
      target instanceof Element &&
      target.closest('button, input, [role="dialog"], [data-no-tile-drag]') !=
        null

    const handlePointerFinish = (event: PointerEvent) => {
      const gesture = tileGesture.current
      if (!gesture || gesture.pointerId !== event.pointerId) {
        return
      }
      if (gesture.moved) {
        suppressDoubleClickUntil.current = Date.now() + 400
        if (
          gesture.kind === 'swap' &&
          gesture.targetViewIdx != null &&
          gesture.targetViewIdx !== gesture.sourceViewIdx
        ) {
          onControl({
            type: 'swap-wall-streams',
            fromViewIdx: gesture.sourceViewIdx,
            toViewIdx: gesture.targetViewIdx,
          })
        } else if (gesture.kind === 'resize' && gesture.targetViewIdx != null) {
          onControl({
            type: 'resize-wall-tile',
            viewIdx: gesture.sourceViewIdx,
            targetViewIdx: gesture.targetViewIdx,
          })
        }
      }
      if (event.currentTarget instanceof Element) {
        const target = event.currentTarget as HTMLElement
        if (
          !target.hasPointerCapture ||
          target.hasPointerCapture(event.pointerId)
        ) {
          target.releasePointerCapture?.(event.pointerId)
        }
      }
      clearTileGesture()
    }

    return (
      <TileInteractionLayer
        key={viewIdx}
        data-wall-tile
        data-view-idx={viewIdx}
        data-wall-chrome-visible={
          visibleChromeViewIdx === viewIdx ? 'true' : 'false'
        }
        $pos={pos}
        $isDragging={dragSourceViewIdx === viewIdx}
        $isResizing={resizeSourceViewIdx === viewIdx}
        onDblClick={(event) => {
          if (
            Date.now() < suppressDoubleClickUntil.current ||
            !view ||
            !content ||
            interactiveTarget(event.target)
          ) {
            return
          }
          onControl({
            type: 'set-wall-fullscreen',
            viewIdx,
            fullscreen: fullscreenViewIdx == null,
          })
        }}
        onPointerDown={(event) => {
          showTileChrome(viewIdx)
          if (
            fullscreenViewIdx != null ||
            interactiveTarget(event.target) ||
            (event.button !== 0 && event.button !== 2) ||
            (event.button === 2 && !hasAssignment)
          ) {
            return
          }
          if (event.button === 2) {
            event.preventDefault()
          }
          tileGesture.current = {
            kind: event.button === 2 ? 'resize' : 'swap',
            pointerId: event.pointerId,
            sourceViewIdx: viewIdx,
            startX: event.clientX,
            startY: event.clientY,
            moved: false,
            targetViewIdx: null,
          }
          ;(event.currentTarget as HTMLElement).setPointerCapture?.(
            event.pointerId,
          )
        }}
        onPointerMove={(event) => {
          showTileChrome(viewIdx)
          const gesture = tileGesture.current
          if (!gesture || gesture.pointerId !== event.pointerId) {
            return
          }
          if (
            !gesture.moved &&
            Math.hypot(
              event.clientX - gesture.startX,
              event.clientY - gesture.startY,
            ) < 6
          ) {
            return
          }
          gesture.moved = true
          const targetViewIdx = baseSpaceAtPoint(event.clientX, event.clientY)
          gesture.targetViewIdx = targetViewIdx ?? null
          if (gesture.kind === 'swap') {
            setDragSourceViewIdx(gesture.sourceViewIdx)
          } else {
            setResizeSourceViewIdx(gesture.sourceViewIdx)
            setResizeTargetViewIdx(targetViewIdx ?? null)
          }
          if (event.cancelable) {
            event.preventDefault()
          }
        }}
        onPointerEnter={() => showTileChrome(viewIdx)}
        onPointerLeave={() => hideTileChrome(viewIdx)}
        onFocusCapture={() => showTileChrome(viewIdx)}
        onPointerUp={handlePointerFinish}
        onPointerCancel={clearTileGesture}
        onContextMenu={(event) => event.preventDefault()}
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
        {hasAssignment && (
          <UsernameBadge
            data-wall-username
            $isVisible={visibleChromeViewIdx === viewIdx}
          >
            {username}
          </UsernameBadge>
        )}
        {view && context && (
          <WallMediaControls
            viewId={context.id}
            viewIdx={viewIdx}
            isPaused={context.isPaused ?? false}
            volume={context.volume}
            audioMode={wallAudioMode}
            fitMode={context.wallFitMode ?? 'fill'}
            isVisible={visibleChromeViewIdx === viewIdx}
            onControl={onControl}
          />
        )}
        <TilePickerButton
          data-wall-tile-picker
          type="button"
          aria-label={`Choose stream for tile ${viewIdx + 1}`}
          $empty={!hasAssignment}
          $isVisible={visibleChromeViewIdx === viewIdx}
          data-no-tile-drag
          draggable={false}
          onClick={() => {
            setGridMenuOpen(false)
            setPickerViewIdx(viewIdx)
          }}
        >
          {hasAssignment ? <FaEdit /> : <FaPlus />}
        </TilePickerButton>
      </TileInteractionLayer>
    )
  }

  const normalTiles = []
  const renderedViewIds = new Set<number>()
  const renderedStreamIds = new Set<string>()
  for (const basePos of baseLayout) {
    const baseViewIdx = basePos.spaces[0]
    const view = viewsBySpace.get(baseViewIdx)
    if (view && view.context.pos && !renderedViewIds.has(view.context.id)) {
      renderedViewIds.add(view.context.id)
      const viewIdx = Math.min(...view.context.pos.spaces)
      const slot =
        wallSlotsBySpace.get(viewIdx) ?? wallSlotsBySpace.get(baseViewIdx)
      if (slot?.streamId) {
        renderedStreamIds.add(slot.streamId)
      }
      normalTiles.push(renderTile(viewIdx, view.context.pos, view, slot))
      continue
    }
    if (view) {
      continue
    }

    const slot = wallSlotsBySpace.get(baseViewIdx)
    if (slot?.streamId) {
      if (renderedStreamIds.has(slot.streamId)) {
        continue
      }
      renderedStreamIds.add(slot.streamId)
      const spaces = wallSlots
        .filter((candidate) => candidate.streamId === slot.streamId)
        .map((candidate) => candidate.viewIdx)
      const pos = mergeLiveTilePositions(baseLayout, spaces) ?? basePos
      const viewIdx = Math.min(...pos.spaces)
      normalTiles.push(
        renderTile(viewIdx, pos, undefined, wallSlotsBySpace.get(viewIdx)),
      )
      continue
    }

    normalTiles.push(renderTile(baseViewIdx, basePos))
  }

  const fullscreenView =
    fullscreenViewIdx == null ? undefined : viewsBySpace.get(fullscreenViewIdx)
  const fullscreenTiles =
    fullscreenViewIdx != null && fullscreenView
      ? [
          renderTile(
            fullscreenViewIdx,
            {
              x: 0,
              y: 0,
              width,
              height,
              spaces: [fullscreenViewIdx],
            },
            fullscreenView,
            wallSlotsBySpace.get(fullscreenViewIdx),
          ),
        ]
      : []

  const resizePreviewSpaces =
    resizeSourceViewIdx != null && resizeTargetViewIdx != null
      ? computeLiveTileSpanSpaces(
          tileCount,
          resizeSourceViewIdx,
          resizeTargetViewIdx,
        )
      : []
  const resizePreviewPos = mergeLiveTilePositions(
    baseLayout,
    resizePreviewSpaces,
  )

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
      {fullscreenViewIdx == null && resizePreviewPos && (
        <ResizePreview data-wall-resize-preview $pos={resizePreviewPos} />
      )}
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
      <strong>gridtv</strong> {packageInfo.version}
    </VersionText>
  )
}

const OverlayContainer = styled.div`
  overflow: hidden;
  pointer-events: none;
`

const TileInteractionLayer = styled.div<{
  $pos: ViewPos
  $isDragging: boolean
  $isResizing: boolean
}>`
  display: flex;
  align-items: flex-start;
  position: fixed;
  left: ${({ $pos }) => $pos.x}px;
  top: ${({ $pos }) => $pos.y}px;
  width: ${({ $pos }) => $pos.width}px;
  height: ${({ $pos }) => $pos.height}px;
  border: 0;
  outline: 0;
  box-shadow: none;
  box-sizing: border-box;
  container-type: size;
  pointer-events: auto;
  user-select: none;
  touch-action: none;
  cursor: ${({ $isDragging, $isResizing }) =>
    $isResizing ? 'nwse-resize' : $isDragging ? 'grabbing' : 'grab'};
  opacity: ${({ $isDragging }) => ($isDragging ? 0.62 : 1)};
  transition: opacity 100ms ease-out;
`

const UsernameBadge = styled.div<{ $isVisible: boolean }>`
  position: absolute;
  top: clamp(5px, 3cqh, 12px);
  left: 50%;
  z-index: 110;
  max-width: 70%;
  box-sizing: border-box;
  padding: clamp(4px, 1.8cqh, 8px) clamp(8px, 3cqw, 14px);
  overflow: hidden;
  color: white;
  font-size: clamp(10px, 5cqh, 16px);
  font-weight: 750;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: rgba(8, 10, 14, 0.84);
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: clamp(5px, 2cqh, 9px);
  box-shadow: 0 3px 14px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(12px);
  opacity: ${({ $isVisible }) => ($isVisible ? 1 : 0)};
  pointer-events: none;
  transform: translateX(-50%);
  transition: opacity 120ms ease-out;
`

const ResizePreview = styled.div<{ $pos: ViewPos }>`
  position: fixed;
  left: ${({ $pos }) => $pos.x}px;
  top: ${({ $pos }) => $pos.y}px;
  z-index: 160;
  width: ${({ $pos }) => $pos.width}px;
  height: ${({ $pos }) => $pos.height}px;
  box-sizing: border-box;
  background: rgba(139, 92, 246, 0.16);
  border: 0;
  outline: 0;
  box-shadow: none;
  pointer-events: none;
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

const TilePickerButton = styled.button<{
  $empty: boolean
  $isVisible: boolean
}>`
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
  opacity: ${({ $empty, $isVisible }) =>
    $isVisible ? ($empty ? 0.68 : 1) : 0};
  pointer-events: ${({ $isVisible }) => ($isVisible ? 'auto' : 'none')};
  cursor: pointer;
  transition: opacity 120ms ease-out;

  &:hover,
  &:focus-visible {
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
