import { type JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { FaSearch, FaTimes, FaTwitch } from 'react-icons/fa'
import {
  twitchLoginFromInput,
  type TwitchChannelSuggestion,
} from 'streamwall-shared'
import { styled } from 'styled-components'

const SEARCH_DEBOUNCE_MS = 350

export function StreamPickerDialog({
  viewIdx,
  initialValue,
  onSearch,
  onSubmit,
  onClose,
}: {
  viewIdx: number
  initialValue: string
  onSearch: (query: string) => Promise<TwitchChannelSuggestion[]>
  onSubmit: (username: string) => void
  onClose: () => void
}) {
  const [value, setValue] = useState(initialValue)
  const [suggestions, setSuggestions] = useState<TwitchChannelSuggestion[]>([])
  const [isSearching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    const query = value.trim()
    const login = twitchLoginFromInput(query)
    if (query.length < 2 || login == null) {
      setSuggestions([])
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    const timeout = setTimeout(() => {
      onSearch(login)
        .then((next) => {
          if (!cancelled) {
            setSuggestions(next)
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSuggestions([])
          }
        })
        .finally(() => {
          if (!cancelled) {
            setSearching(false)
          }
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [onSearch, value])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const submit = (username: string) => {
    const trimmed = username.trim()
    if (trimmed && twitchLoginFromInput(trimmed) == null) {
      setError('Enter a Twitch username or channel URL.')
      return
    }
    onSubmit(trimmed)
  }

  const handleSubmit: JSX.GenericEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault()
    submit(value)
  }

  return (
    <DialogBackdrop data-testid="stream-picker" onClick={onClose}>
      <DialogPanel
        role="dialog"
        aria-modal="true"
        aria-labelledby="stream-picker-title"
        onClick={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <div>
            <DialogTitle id="stream-picker-title">
              Replace tile {viewIdx + 1}
            </DialogTitle>
            <DialogSubtitle>Type only the Twitch username.</DialogSubtitle>
          </div>
          <CloseButton type="button" aria-label="Close" onClick={onClose}>
            <FaTimes />
          </CloseButton>
        </DialogHeader>

        <PickerForm onSubmit={handleSubmit}>
          <InputWrap>
            <FaTwitch aria-hidden="true" />
            <ChannelInput
              ref={inputRef}
              value={value}
              onInput={(event) => {
                setValue(event.currentTarget.value)
                setError(null)
              }}
              placeholder="lacy"
              aria-label="Twitch username"
              autoComplete="off"
              spellcheck={false}
            />
            {isSearching && <SearchSpinner aria-label="Searching Twitch" />}
          </InputWrap>
          {error && <ErrorText role="alert">{error}</ErrorText>}

          {suggestions.length > 0 && (
            <SuggestionList aria-label="Twitch channel suggestions">
              {suggestions.map((suggestion) => (
                <SuggestionButton
                  key={suggestion.login}
                  type="button"
                  onClick={() => submit(suggestion.login)}
                >
                  <SuggestionIdentity>
                    <strong>{suggestion.displayName}</strong>
                    <span>@{suggestion.login}</span>
                  </SuggestionIdentity>
                  {suggestion.isLive && <LiveBadge>LIVE</LiveBadge>}
                </SuggestionButton>
              ))}
            </SuggestionList>
          )}

          <DialogActions>
            <ClearButton type="button" onClick={() => submit('')}>
              Clear tile
            </ClearButton>
            <LoadButton type="submit">
              <FaSearch /> Load stream
            </LoadButton>
          </DialogActions>
        </PickerForm>
      </DialogPanel>
    </DialogBackdrop>
  )
}

const DialogBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 11000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.68);
  backdrop-filter: blur(11px);
  pointer-events: auto;
`

const DialogPanel = styled.div`
  width: min(480px, calc(100vw - 40px));
  padding: 22px;
  box-sizing: border-box;
  color: #f8fafc;
  background: rgba(12, 15, 21, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.68);
  font-family: 'Noto Sans', sans-serif;
`

const DialogHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
`

const DialogTitle = styled.h1`
  margin: 0;
  font-size: 21px;
`

const DialogSubtitle = styled.p`
  margin: 3px 0 0;
  color: #9ca3af;
  font-size: 13px;
`

const CloseButton = styled.button`
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  color: #d1d5db;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    color: white;
    background: rgba(255, 255, 255, 0.16);
    outline: 2px solid white;
  }
`

const PickerForm = styled.form`
  margin-top: 18px;
`

const InputWrap = styled.label`
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 0 13px;
  color: #a78bfa;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 10px;

  &:focus-within {
    border-color: #a78bfa;
    box-shadow: 0 0 0 2px rgba(167, 139, 250, 0.25);
  }
`

const ChannelInput = styled.input`
  flex: 1;
  min-width: 0;
  color: white;
  background: transparent;
  border: 0;
  outline: 0;
  font: inherit;
  font-size: 16px;
`

const SearchSpinner = styled.div`
  width: 15px;
  height: 15px;
  border: 2px solid rgba(255, 255, 255, 0.25);
  border-top-color: white;
  border-radius: 50%;
  animation: search-spin 0.7s linear infinite;

  @keyframes search-spin {
    to {
      transform: rotate(360deg);
    }
  }
`

const ErrorText = styled.div`
  margin-top: 7px;
  color: #fca5a5;
  font-size: 12px;
`

const SuggestionList = styled.div`
  display: flex;
  flex-direction: column;
  max-height: 260px;
  margin-top: 8px;
  padding: 5px;
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.24);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
`

const SuggestionButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 10px;
  color: white;
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: 7px;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    background: rgba(255, 255, 255, 0.11);
    outline: 1px solid rgba(255, 255, 255, 0.55);
  }
`

const SuggestionIdentity = styled.span`
  display: flex;
  flex-direction: column;
  min-width: 0;

  strong,
  span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  span {
    color: #9ca3af;
    font-size: 11px;
  }
`

const LiveBadge = styled.span`
  flex: 0 0 auto;
  padding: 2px 6px;
  color: white;
  background: #ef4444;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.08em;
`

const DialogActions = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 16px;
`

const ClearButton = styled.button`
  padding: 9px 13px;
  color: #d1d5db;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.13);
  border-radius: 8px;
  font: inherit;
  cursor: pointer;
`

const LoadButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 14px;
  color: white;
  background: #9147ff;
  border: 1px solid #b084ff;
  border-radius: 8px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
`
