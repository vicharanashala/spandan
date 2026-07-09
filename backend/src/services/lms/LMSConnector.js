export class LMSConnector {
  /**
   * Push grades to the LMS
   * @param {Object} sessionResults - The session results payload containing scores
   * @param {Object} config - LMS specific configuration (courseId, assignmentId, tokens, etc)
   */
  async pushGrades(sessionResults, config) {
    throw new Error('pushGrades must be implemented by subclasses')
  }
}
