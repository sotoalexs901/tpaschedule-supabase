// Pure capacity policy for testing; NOT a server-side enforcement mechanism.
export const MAX_UMNR_PER_AGENT = 10;
export function canAssignService({ wchrCount = 0, umnrCount = 0, serviceType, incomingCount = 1 }) {
  const w = Number(wchrCount), u = Number(umnrCount), n = Number(incomingCount);
  if (![w,u,n].every(Number.isInteger) || w < 0 || u < 0 || n !== 1) return false;
  if (serviceType === 'WCHR') return w === 0 && u === 0;
  if (serviceType === 'UMNR') return w === 0 && u < MAX_UMNR_PER_AGENT;
  return false;
}
