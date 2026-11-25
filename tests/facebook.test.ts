import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkFacebook, fetchFacebookPage } from '../server/facebook'

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
const fail = (code: number, subcode?: number, message = 'nope') =>
  new Response(JSON.stringify({ error: { code, error_subcode: subcode, message } }), { status: 400 })

const stub = (...responses: Response[]) => {
  const spy = vi.spyOn(globalThis, 'fetch')
  for (const r of responses) spy.mockResolvedValueOnce(r)
  return spy
}

const page = {
  id: '1234567890',
  name: ' Riya Style ',
  username: 'RiyaStyle',
  about: 'Fashion and travel. Insta: instagram.com/riya.style',
  category: 'Digital creator',
  fan_count: 4200,
  followers_count: 5100,
  website: 'https://riya.style  http://shop.riya.style, notalink',
  picture: { data: { url: 'https://scontent.xx.fbcdn.net/p.jpg' } },
  verification_status: 'blue_verified',
}

describe("server/facebook.ts: Facebook's answers", () => {
  beforeEach(() => {
    process.env.META_ACCESS_TOKEN = 'test-token'
  })
  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.META_ACCESS_TOKEN
  })

  it('maps a Page in one call and never puts the token in the profile', async () => {
    const spy = stub(ok(page))
    const p = await fetchFacebookPage('riyastyle')
    expect(spy).toHaveBeenCalledTimes(1)
    const url = new URL(String(spy.mock.calls[0]![0]))
    expect(url.pathname).toBe('/v21.0/riyastyle')
    expect(url.searchParams.get('fields')).toContain('followers_count')
    expect(p).toMatchObject({
      platform: 'facebook',
      handle: 'riyastyle',
      profile_url: 'https://www.facebook.com/riyastyle',
      display_name: 'Riya Style',
      bio: 'Fashion and travel. Insta: instagram.com/riya.style',
      links: ['https://riya.style', 'http://shop.riya.style'],
      profile_pic_url: 'https://scontent.xx.fbcdn.net/p.jpg',
      is_verified: true,
      metrics: { page_followers: 5100, page_likes: 4200, page_category: 'Digital creator' },
    })
    expect(p.linked_accounts).toContainEqual(expect.objectContaining({ platform: 'instagram', handle: 'riya.style' }))
    expect(JSON.stringify(p)).not.toContain('test-token')
  })

  it('keeps the numeric id when the Page has no username, and leaves missing numbers empty', async () => {
    stub(ok({ id: '1234567890', name: 'Local Cafe' }))
    const p = await fetchFacebookPage('1234567890')
    expect(p).toMatchObject({ handle: '1234567890', is_verified: false, links: [], bio: null, profile_pic_url: null })
    expect(p.metrics).toEqual({ page_followers: null, page_likes: null, page_category: null })
  })

  it('turns Meta errors into the app’s lookup errors', async () => {
    stub(fail(803))
    await expect(fetchFacebookPage('nobody.here')).rejects.toMatchObject({ code: 'not_found' })
    stub(fail(100, 33))
    await expect(fetchFacebookPage('hidden.page')).rejects.toMatchObject({ code: 'not_found' })
    stub(fail(100, undefined, '(#100) Tried accessing nonexisting field (category) on node type (User)'))
    await expect(fetchFacebookPage('some.person')).rejects.toMatchObject({ code: 'not_found', message: expect.stringContaining('personal profile') })
    stub(fail(10))
    await expect(fetchFacebookPage('riyastyle')).rejects.toMatchObject({ code: 'not_connected', message: expect.stringContaining('Page Public Metadata Access') })
    stub(fail(190))
    await expect(fetchFacebookPage('riyastyle')).rejects.toMatchObject({ code: 'not_connected' })
    stub(fail(4))
    await expect(fetchFacebookPage('riyastyle')).rejects.toMatchObject({ code: 'rate_limited' })
    stub(fail(1))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(fetchFacebookPage('riyastyle')).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('refuses names that aren’t a Page name or id, without calling Meta', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    await expect(fetchFacebookPage('bad name!')).rejects.toMatchObject({ code: 'not_found' })
    await expect(fetchFacebookPage('a')).rejects.toMatchObject({ code: 'not_found' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('reports an outage as unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'))
    await expect(fetchFacebookPage('riyastyle')).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('checks the token with /me at start-up', async () => {
    const spy = stub(ok({ id: '1' }))
    await checkFacebook()
    expect(new URL(String(spy.mock.calls[0]![0])).pathname).toBe('/v21.0/me')
    stub(fail(190))
    await expect(checkFacebook()).rejects.toMatchObject({ code: 'not_connected' })
  })
})
