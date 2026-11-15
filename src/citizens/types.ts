export type RequestStatus = 'open' | 'satisfied' | 'failed'

/** A citizen request the player can fulfil, e.g. "more benches near the playground". */
export interface CitizenRequest {
  id: string
  citizenName: string
  text: string
  status: RequestStatus
}
