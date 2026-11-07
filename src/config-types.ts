export interface PortfolioConfig {
  github: string
  name: string
  photo: string | null
  timeZone: string
  timeZoneLabel?: string
  excludeOwners: string[]
  includeOwnRepos: boolean
  allowViewer: boolean
  /** owner/repo of this site's code, for the "Fork this site" link. Filled automatically in GitHub Actions. */
  sourceRepo?: string | null
}
