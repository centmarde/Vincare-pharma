
import { createAppRouter } from './router';
import { setupGuards } from './guards';

/**
 * Create router instance and setup guards
 */
const router = createAppRouter();

// Setup authentication guards and error handling
setupGuards(router);

export default router;
