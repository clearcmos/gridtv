import { StreamwallState } from 'gridtv-shared'
import { render } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { useHotkeys } from 'react-hotkeys-hook'
import { StreamwallLayerGlobal } from '../preload/layerPreload'
import { initRendererSentry } from './initSentry'
import { Overlay } from './OverlayRoot'

import '@fontsource/noto-sans'
import './appGlobal.css'

declare global {
  interface Window {
    streamwallLayer: StreamwallLayerGlobal
  }
}

initRendererSentry()

function App() {
  const [state, setState] = useState<StreamwallState | undefined>()
  const [gridMenuShortcut, setGridMenuShortcut] = useState(0)
  const [fitModeShortcut, setFitModeShortcut] = useState(0)
  const [fullscreenExitShortcut, setFullscreenExitShortcut] = useState(0)

  useEffect(() => {
    const unsubscribe = window.streamwallLayer.onState(setState)
    window.streamwallLayer.load()
    return unsubscribe
  }, [])

  useEffect(
    () =>
      window.streamwallLayer.onGridMenuShortcut(() =>
        setGridMenuShortcut((value) => value + 1),
      ),
    [],
  )

  useEffect(
    () =>
      window.streamwallLayer.onFitModeShortcut(() =>
        setFitModeShortcut((value) => value + 1),
      ),
    [],
  )

  useEffect(
    () =>
      window.streamwallLayer.onFullscreenExitShortcut(() =>
        setFullscreenExitShortcut((value) => value + 1),
      ),
    [],
  )

  useHotkeys('ctrl+shift+i', () => {
    window.streamwallLayer.openDevTools()
  })

  if (!state) {
    return
  }

  const { config, views, streams, wallSlots, fullscreenViewIdx } = state
  return (
    <Overlay
      config={config}
      views={views}
      streams={streams}
      wallSlots={wallSlots}
      fullscreenViewIdx={fullscreenViewIdx}
      onControl={window.streamwallLayer.control}
      onSearchTwitch={window.streamwallLayer.searchTwitch}
      gridMenuShortcut={gridMenuShortcut}
      fitModeShortcut={fitModeShortcut}
      fullscreenExitShortcut={fullscreenExitShortcut}
    />
  )
}

render(<App />, document.body)
