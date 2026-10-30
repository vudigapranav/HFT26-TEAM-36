// Draft resource paths from context §11.5; only health is implemented in K1.
// This inventory is metadata, not a claim that the remaining routes exist.
export const apiRoutes = [
  ['POST', '/auth/register'], ['POST', '/auth/login'], ['POST', '/auth/logout'],
  ['POST', '/portfolio'], ['GET', '/onboarding-quiz'], ['POST', '/onboarding-quiz'],
  ['POST', '/assessments'], ['GET', '/assessments/{id}/status'],
  ['GET', '/assessments/{id}/tasks/{task_id}'], ['PUT', '/assessments/{id}/tasks/{task_id}/files'],
  ['POST', '/assessments/{id}/tasks/{task_id}/run'], ['POST', '/assessments/{id}/tasks/{task_id}/submit'],
  ['POST', '/assessments/{id}/hint'], ['POST', '/assessments/{id}/assistant'],
  ['POST', '/assessments/{id}/events'], ['POST', '/assessments/{id}/tier/upgrade'],
  ['GET', '/reports/{id}'],
] as const;
