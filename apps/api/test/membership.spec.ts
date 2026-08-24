import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { user } from '../src/db/schema'
import { confirmGroup, confirmPaid, findMembership, verifyMembership } from '../src/lib/membership'
import { createTestUser, db, getOrCreateOrg } from './helpers'

describe('membership state machine', () => {
  let orgId: string
  let actorId: string

  beforeEach(async () => {
    orgId = (await getOrCreateOrg()).id
    // paid_confirmed_by / in_group_by / audit_log.actor_id 都有 FK 约束，
    // 必须是真实存在的 user，不能用任意字符串占位。
    actorId = (await createTestUser({ email: `actor-${crypto.randomUUID()}@t.com` })).userId
  })

  it('verify moves applied -> pending_payment and stamps user verification', async () => {
    const { userId, membershipId } = await createTestUser({
      email: `a-${crypto.randomUUID()}@t.com`,
    })
    const before = await findMembership(db(), orgId, membershipId)

    const after = await verifyMembership(db(), before, actorId)
    expect(after.status).toBe('pending_payment')

    const [userRow] = await db().select().from(user).where(eq(user.id, userId)).limit(1)
    expect(userRow?.emailVerifiedAt).not.toBeNull()
    expect(userRow?.verifiedBy).toBe('manual')
  })

  it('confirm-paid after verify activates and assigns member_no', async () => {
    const { membershipId } = await createTestUser({
      email: `b-${crypto.randomUUID()}@t.com`,
      term: '2099',
    })
    let row = await findMembership(db(), orgId, membershipId)
    row = await verifyMembership(db(), row, actorId)
    row = await confirmPaid(db(), row, actorId)

    expect(row.status).toBe('active')
    expect(row.memberNo).toBe(99001)
  })

  it('member_no increments sequentially within the same term prefix', async () => {
    const term = `21${Math.floor(Math.random() * 90 + 10)}` // 独立随机届别，避免与其他用例的编号区间重叠
    const grade = Number.parseInt(term.slice(-2), 10)

    const first = await createTestUser({ email: `c1-${crypto.randomUUID()}@t.com`, term })
    let row1 = await findMembership(db(), orgId, first.membershipId)
    row1 = await verifyMembership(db(), row1, actorId)
    row1 = await confirmPaid(db(), row1, actorId)

    const second = await createTestUser({ email: `c2-${crypto.randomUUID()}@t.com`, term })
    let row2 = await findMembership(db(), orgId, second.membershipId)
    row2 = await verifyMembership(db(), row2, actorId)
    row2 = await confirmPaid(db(), row2, actorId)

    expect(row1.memberNo).toBe(grade * 1000 + 1)
    expect(row2.memberNo).toBe(grade * 1000 + 2)
  })

  it('confirm-paid before verify only stamps paid_confirmed_at, activation completes on verify', async () => {
    const { membershipId } = await createTestUser({
      email: `d-${crypto.randomUUID()}@t.com`,
      term: '2077',
    })
    let row = await findMembership(db(), orgId, membershipId)

    row = await confirmPaid(db(), row, actorId)
    expect(row.status).toBe('applied')
    expect(row.paidConfirmedAt).not.toBeNull()

    row = await verifyMembership(db(), row, actorId)
    expect(row.status).toBe('active')
    expect(row.memberNo).toBe(77001)
  })

  it('rejects verify on an already-active membership', async () => {
    const { membershipId } = await createTestUser({
      email: `e-${crypto.randomUUID()}@t.com`,
      term: '2066',
    })
    let row = await findMembership(db(), orgId, membershipId)
    row = await verifyMembership(db(), row, actorId)
    row = await confirmPaid(db(), row, actorId)
    expect(row.status).toBe('active')

    await expect(verifyMembership(db(), row, actorId)).rejects.toMatchObject({
      status: 409,
      code: 'invalid_transition',
    })
  })

  it('rejects confirm-paid on an already-active membership', async () => {
    const { membershipId } = await createTestUser({
      email: `f-${crypto.randomUUID()}@t.com`,
      term: '2055',
    })
    let row = await findMembership(db(), orgId, membershipId)
    row = await verifyMembership(db(), row, actorId)
    row = await confirmPaid(db(), row, actorId)

    await expect(confirmPaid(db(), row, actorId)).rejects.toMatchObject({
      status: 409,
      code: 'invalid_transition',
    })
  })

  it('member_no never changes once assigned, even if activation is attempted again', async () => {
    const { membershipId } = await createTestUser({
      email: `g-${crypto.randomUUID()}@t.com`,
      term: '2044',
    })
    let row = await findMembership(db(), orgId, membershipId)
    row = await verifyMembership(db(), row, actorId)
    row = await confirmPaid(db(), row, actorId)
    const assigned = row.memberNo

    // 再造一个同届成员，确认第一个人的编号没有被后续分配影响
    const other = await createTestUser({ email: `h-${crypto.randomUUID()}@t.com`, term: '2044' })
    let otherRow = await findMembership(db(), orgId, other.membershipId)
    otherRow = await verifyMembership(db(), otherRow, actorId)
    otherRow = await confirmPaid(db(), otherRow, actorId)

    const reloaded = await findMembership(db(), orgId, membershipId)
    expect(reloaded.memberNo).toBe(assigned)
    expect(otherRow.memberNo).toBe((assigned ?? 0) + 1)
  })

  it('confirm-group is independent of status and does not change it', async () => {
    const { membershipId } = await createTestUser({ email: `i-${crypto.randomUUID()}@t.com` })
    const before = await findMembership(db(), orgId, membershipId)
    const after = await confirmGroup(db(), before, actorId)

    expect(after.status).toBe(before.status)
    expect(after.inGroupAt).not.toBeNull()
    expect(after.inGroupBy).toBe(actorId)
  })
})
