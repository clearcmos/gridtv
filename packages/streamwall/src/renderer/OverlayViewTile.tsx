import Color from 'color'
import {
  FaExclamationTriangle,
  FaFacebook,
  FaInstagram,
  FaTiktok,
  FaTwitch,
  FaYoutube,
} from 'react-icons/fa'
import { RiKickFill, RiTwitterXFill } from 'react-icons/ri'
import type { StreamData } from 'streamwall-shared'
import { styled } from 'styled-components'
import { TailSpin } from './TailSpin'

// Extracted from overlay.tsx so it can be rendered and tested in isolation,
// without pulling in the module-level `render(<App />, document.body)` call.
export function OverlayViewTile({
  url,
  data,
  isError,
  errorReason,
  isBlurred,
  isLoading,
}: {
  url: string
  data: StreamData | undefined
  isError: boolean
  errorReason: string | null | undefined
  isBlurred: boolean
  isLoading: boolean
}) {
  const label = data?.label || data?.source

  if (isError) {
    return (
      <ErrorCover>
        <ErrorIcon>
          <FaExclamationTriangle />
        </ErrorIcon>
        <ErrorHeading>
          <StreamIcon url={url} />
          <span>{label ?? 'Stream error'}</span>
        </ErrorHeading>
        {errorReason && <ErrorReason>{errorReason}</ErrorReason>}
      </ErrorCover>
    )
  }

  return (
    <>
      <FilterCover $isBlurred={isBlurred} $isDesaturated={isLoading} />
      <LoadingSpinner $isVisible={isLoading} />
    </>
  )
}

function StreamIcon({ url }: { url: string }) {
  let parsedURL
  try {
    parsedURL = new URL(url)
  } catch {
    return null
  }

  let { host } = parsedURL
  host = host.replace(/^www\./, '')
  if (host === 'youtube.com' || host === 'youtu.be') {
    return <FaYoutube />
  } else if (host === 'facebook.com' || host === 'm.facebook.com') {
    return <FaFacebook />
  } else if (host === 'twitch.tv') {
    return <FaTwitch />
  } else if (host === 'instagram.com') {
    return <FaInstagram />
  } else if (host === 'tiktok.com') {
    return <FaTiktok />
  } else if (host === 'kick.com') {
    return <RiKickFill />
  } else if (host === 'x.com') {
    return <RiTwitterXFill />
  }
  return null
}

const LoadingSpinner = styled(TailSpin)<{ $isVisible: boolean }>`
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: clamp(24px, 35cqh, 100px);
  height: clamp(24px, 35cqh, 100px);
  opacity: ${({ $isVisible }) => ($isVisible ? 0.5 : 0)};

  transition:
    opacity 0.5s ease-in-out,
    visibility 0s ${({ $isVisible }) => ($isVisible ? '0s' : '0.5s')};
  visibility: ${({ $isVisible }) => ($isVisible ? 'visible' : 'hidden')};
`

const FilterCover = styled.div<{
  $isBlurred: boolean
  $isDesaturated: boolean
}>`
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  backdrop-filter: ${({ $isBlurred, $isDesaturated }) =>
    [
      $isBlurred ? 'blur(30px)' : '',
      $isDesaturated ? 'grayscale(75%)' : '',
    ].join(' ')};
`

const ErrorCover = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(3px, 2cqh, 8px);
  padding: clamp(4px, 3cqh, 12px);
  box-sizing: border-box;
  text-align: center;
  color: white;
  background: ${Color('#300').alpha(0.55).toString()};
  backdrop-filter: blur(4px) grayscale(80%);
`

const ErrorIcon = styled.div`
  display: flex;
  color: #ff5a5a;
  filter: drop-shadow(0 0 6px black);

  svg {
    width: clamp(18px, 15cqh, 44px);
    height: clamp(18px, 15cqh, 44px);
  }
`

const ErrorHeading = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.35em;
  max-width: 100%;
  font-weight: 700;
  font-size: clamp(10px, 7cqh, 22px);
  letter-spacing: -0.025em;
  text-shadow: 0 0 4px black;

  span {
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
  }

  svg {
    width: 1.1em;
    height: 1.1em;
    flex-shrink: 0;
    filter: drop-shadow(0 0 4px black);

    path {
      fill: white;
    }
  }
`

const ErrorReason = styled.div`
  max-width: 100%;
  font-size: clamp(8px, 4.5cqh, 15px);
  font-weight: 500;
  line-height: 1.3;
  opacity: 0.9;
  text-shadow: 0 0 4px black;
  overflow-wrap: anywhere;

  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
`
