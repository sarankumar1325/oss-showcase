/**
 * The only file you need to edit after forking.
 *
 * Everything shown on the site is public GitHub data. No token is needed:
 * the deploy workflow uses GitHub's built-in token, and visitors' browsers
 * talk to the public API directly.
 */
import type { PortfolioConfig } from './src/config-types'

const config: PortfolioConfig = {
  /** Your GitHub username. */
  github: 'sarankumar1325',

  /** How your name appears in the hero and footer. */
  name: 'Saran Kumar',

  /**
   * A file in /public (for example 'me.jpg'), a full https URL,
   * or null to use your GitHub avatar.
   */
  photo: 'saran.jpg',

  /** IANA time zone used to bucket merges into days and hours. */
  timeZone: 'Asia/Kolkata',

  /** Short label shown next to times. Leave undefined to derive it from the zone. */
  timeZoneLabel: 'IST',

  /** Owners whose repositories should not count, such as your employer's org. */
  excludeOwners: [],

  /** Count PRs merged into repositories you own yourself. */
  includeOwnRepos: false,

  /** Let visitors open anyone's portfolio with ?u=<username>. */
  allowViewer: true,

  /**
   * owner/repo of this site's code, used for the "Fork this site" link.
   * Leave null: GitHub Actions fills it with the repository being deployed.
   */
  sourceRepo: null,
}

export default config
