/** What the user's own data says, for suggestions: current CV (parsed by the worker) + profile. */
export type CvFacts = {
  /** Profile title, CV headline, job titles from the CV experience (newest first). */
  titles: string[];
  /** Profile skills, then CV skills. */
  skills: string[];
  /** Profile location, CV header location, experience locations. */
  locations: string[];
};

export interface CvFactsReader {
  forUser(userId: string): Promise<CvFacts>;
}
