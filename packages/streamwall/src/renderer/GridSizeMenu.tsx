import { LIVE_TILE_MAX, LIVE_TILE_MIN } from 'streamwall-shared'
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
        <MenuHint>F1</MenuHint>
        <MenuTitle id="grid-size-title">Visible tiles</MenuTitle>
        <MenuDescription>
          Choose the exact number of streams on the wall.
        </MenuDescription>
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
        <MenuFootnote>Esc closes this menu</MenuFootnote>
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
  width: min(420px, calc(100vw - 40px));
  padding: 24px;
  box-sizing: border-box;
  color: #f8fafc;
  background: rgba(12, 15, 21, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 18px;
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
  margin: 0 0 18px;
  color: #9ca3af;
  font-size: 13px;
`

const NumberGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 9px;
`

const NumberButton = styled.button<{ $active: boolean }>`
  height: 64px;
  color: white;
  background: ${({ $active }) =>
    $active ? 'rgba(239, 68, 68, 0.92)' : 'rgba(255, 255, 255, 0.08)'};
  border: 1px solid
    ${({ $active }) =>
      $active ? 'rgba(254, 202, 202, 0.8)' : 'rgba(255, 255, 255, 0.14)'};
  border-radius: 11px;
  font: inherit;
  font-size: 22px;
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

const MenuFootnote = styled.div`
  margin-top: 14px;
  color: #6b7280;
  font-size: 11px;
  text-align: center;
`
