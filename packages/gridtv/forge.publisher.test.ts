import { describe, expect, test } from 'vitest'
import { parseGithubRepository } from './forge.publisher'

describe('parseGithubRepository', () => {
  test('parses the "github:owner/name" shorthand', () => {
    expect(parseGithubRepository('github:clearcmos/gridtv')).toEqual({
      owner: 'clearcmos',
      name: 'gridtv',
    })
  })

  test('parses names containing dots and dashes', () => {
    expect(parseGithubRepository('github:some-org/my.repo-name')).toEqual({
      owner: 'some-org',
      name: 'my.repo-name',
    })
  })

  test('throws when the value is not in "github:owner/name" form', () => {
    expect(() => parseGithubRepository('clearcmos/gridtv')).toThrow(
      /github:owner\/name/,
    )
  })

  test('throws for a full URL instead of the shorthand', () => {
    expect(() =>
      parseGithubRepository('https://github.com/clearcmos/gridtv'),
    ).toThrow(/github:owner\/name/)
  })
})
