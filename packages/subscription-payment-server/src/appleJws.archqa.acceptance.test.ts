/** Run the synthetic certificate acceptance assertions in normal server CI.
 * The test imports a source-only suite and never calls the Apple API or live DB.
 */
import "./appleJws.archqa.acceptance";
