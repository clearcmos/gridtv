import { LIVE_TILE_MAX, LIVE_TILE_MIN } from 'gridtv-shared'
import { styled } from 'styled-components'

export function GridSizeMenu({
  currentCount,
  onSelect,
  onClose,
}: {
  currentCount: number
  onSelect: (count: number) => void
  onClose: () => void
}) {
  return (
    <MenuBackdrop data-testid="grid-size-menu" onClick={onClose}>
      <MenuPanel
        role="dialog"
        aria-modal="true"
        aria-labelledby="grid-size-title"
        onClick={(event) => event.stopPropagation()}
      >
        <MenuHint>F1 · HELP</MenuHint>
        <MenuTitle id="grid-size-title">Wall controls</MenuTitle>
        <MenuDescription>
          Choose the wall size or review the controls.
        </MenuDescription>
        <SectionTitle>Visible tiles</SectionTitle>
        <NumberGrid>
          {Array.from(
            { length: LIVE_TILE_MAX - LIVE_TILE_MIN + 1 },
            (_, offset) => LIVE_TILE_MIN + offset,
          ).map((count) => (
            <NumberButton
              key={count}
              type="button"
              aria-label={`${count} ${count === 1 ? 'tile' : 'tiles'}`}
              aria-pressed={count === currentCount}
              $active={count === currentCount}
              onClick={() => onSelect(count)}
            >
              {count}
            </NumberButton>
          ))}
        </NumberGrid>
        <SectionDivider />
        <SectionTitle>Quick reference</SectionTitle>
        <ControlList>
          <ControlRow>
            <ShortcutKey>F1</ShortcutKey>
            <ControlCopy>
              <strong>Help and layout</strong>
              <span>Open this guide and choose 1–9 visible tiles.</span>
            </ControlCopy>
          </ControlRow>
          <ControlRow>
            <ShortcutKey>F2</ShortcutKey>
            <ControlCopy>
              <strong>Fit / Fill wall</strong>
              <span>
                Toggle every tile between full-frame and edge-to-edge.
              </span>
            </ControlCopy>
          </ControlRow>
          <ControlRow>
            <ShortcutKey>Hover</ShortcutKey>
            <ControlCopy>
              <strong>Media controls</strong>
              <span>Play, volume, Fit/Fill, mute and replace a stream.</span>
            </ControlCopy>
          </ControlRow>
          <ControlRow>
            <ShortcutKey>Double-click</ShortcutKey>
            <ControlCopy>
              <strong>True fullscreen</strong>
              <span>Repeat the double-click or press Esc to return.</span>
            </ControlCopy>
          </ControlRow>
          <ControlRow>
            <ShortcutKey>Left-drag</ShortcutKey>
            <ControlCopy>
              <strong>Swap streams</strong>
              <span>Drop one tile onto another to exchange their places.</span>
            </ControlCopy>
          </ControlRow>
          <ControlRow>
            <ShortcutKey>Right-drag</ShortcutKey>
            <ControlCopy>
              <strong>Stretch a tile</strong>
              <span>
                Drag across cells; displaced streams move if room exists.
              </span>
            </ControlCopy>
          </ControlRow>
          <ControlRow>
            <ShortcutKey>＋ / Edit</ShortcutKey>
            <ControlCopy>
              <strong>Add or replace</strong>
              <span>
                Enter only the Twitch username; a full URL also works.
              </span>
            </ControlCopy>
          </ControlRow>
        </ControlList>
        <MenuFootnote>Esc closes this guide</MenuFootnote>
      </MenuPanel>
    </MenuBackdrop>
  )
}

const MenuBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.62);
  backdrop-filter: blur(10px);
  pointer-events: auto;
  user-select: none;
`

const MenuPanel = styled.div`
  width: min(540px, calc(100vw - 40px));
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  padding: 22px;
  box-sizing: border-box;
  color: #f8fafc;
  background: rgba(12, 15, 21, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 14px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.62);
  font-family: 'Noto Sans', sans-serif;
`

const MenuHint = styled.div`
  display: inline-flex;
  padding: 3px 8px;
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.14);
  border: 1px solid rgba(239, 68, 68, 0.35);
  border-radius: 6px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
`

const MenuTitle = styled.h1`
  margin: 9px 0 2px;
  font-size: 23px;
  line-height: 1.2;
`

const MenuDescription = styled.p`
  margin: 0 0 16px;
  color: #9ca3af;
  font-size: 13px;
`

const NumberGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 9px;
`

const NumberButton = styled.button<{ $active: boolean }>`
  height: 46px;
  color: white;
  background: ${({ $active }) =>
    $active ? 'rgba(239, 68, 68, 0.92)' : 'rgba(255, 255, 255, 0.08)'};
  border: 1px solid
    ${({ $active }) =>
      $active ? 'rgba(254, 202, 202, 0.8)' : 'rgba(255, 255, 255, 0.14)'};
  border-radius: 8px;
  font: inherit;
  font-size: 18px;
  font-weight: 800;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    background: ${({ $active }) =>
      $active ? 'rgba(239, 68, 68, 1)' : 'rgba(255, 255, 255, 0.17)'};
    outline: 2px solid rgba(255, 255, 255, 0.8);
    outline-offset: 2px;
  }
`

const SectionTitle = styled.h2`
  margin: 0 0 8px;
  color: #9ca3af;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
`

const SectionDivider = styled.div`
  height: 1px;
  margin: 18px 0 14px;
  background: rgba(255, 255, 255, 0.12);
`

const ControlList = styled.div`
  display: grid;
  gap: 2px;
`

const ControlRow = styled.div`
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  min-height: 42px;
  padding: 5px 0;
`

const ShortcutKey = styled.kbd`
  justify-self: start;
  max-width: 92px;
  padding: 4px 7px;
  box-sizing: border-box;
  overflow: hidden;
  color: #e5e7eb;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 5px;
  font: inherit;
  font-size: 10px;
  font-weight: 800;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const ControlCopy = styled.div`
  min-width: 0;

  strong,
  span {
    display: block;
  }

  strong {
    color: #f3f4f6;
    font-size: 12px;
  }

  span {
    margin-top: 1px;
    color: #8b93a1;
    font-size: 11px;
    line-height: 1.35;
  }
`

const MenuFootnote = styled.div`
  margin-top: 12px;
  color: #6b7280;
  font-size: 11px;
  text-align: center;
`
