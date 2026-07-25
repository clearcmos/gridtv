import { StreamwallState } from 'gridtv-shared'
import { render } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { useHotkeys } from 'react-hotkeys-hook'
import { StreamwallLayerGlobal } from '../preload/layerPreload'
import type { WallShortcutBridge } from '../wallShortcuts'
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

const shortcutBridge: WallShortcutBridge = {
  send: (input) => window.streamwallLayer.sendShortcutInput(input),
  subscribe: (handler) => window.streamwallLayer.onShortcut(handler),
}

function App() {
  const [state, setState] = useState<StreamwallState | undefined>()

  useEffect(() => {
    const unsubscribe = window.streamwallLayer.onState(setState)
    window.streamwallLayer.load()
    return unsubscribe
  }, [])

  useHotkeys('ctrl+shift+i', () => {
    window.streamwallLayer.openDevTools()
  })

  if (!state) {
    return
  }

  const {
    config,
    views,
    streams,
    wallSlots,
    fullscreenViewIdx,
    fullscreenChatVisible,
  } = state
  return (
    <Overlay
      config={config}
      views={views}
      streams={streams}
      wallSlots={wallSlots}
      fullscreenViewIdx={fullscreenViewIdx}
      fullscreenChatVisible={fullscreenChatVisible}
      onControl={window.streamwallLayer.control}
      onSearchTwitch={window.streamwallLayer.searchTwitch}
      shortcutBridge={shortcutBridge}
    />
  )
}

render(<App />, document.body)
