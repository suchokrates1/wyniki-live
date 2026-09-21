/* Keep the public mock server running (Playwright webServer for the phone E2E suite). */
import { start } from './a11y-mock-server.mjs';

await start(Number(process.env.PUBLIC_MOCK_PORT) || 8823);
