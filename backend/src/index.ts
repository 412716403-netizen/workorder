import 'dotenv/config';
import app from './app.js';
import { env } from './config/env.js';

app.listen(env.PORT, () => {
  console.log(`SmartTrack Pro API running on http://localhost:${env.PORT}`);
});
