import express, { Request, Response } from 'express';
import cors from 'cors';
const app = express();

const port = process.env.PORT || 3000;
const corsOrigin = process.env.CORS_ORIGIN || '*';

app.use(cors({
  origin: corsOrigin
}))

app.get('/health', (req: Request, res: Response) => {
  console.log({path: '/health'})
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
     .send({path: '/health'});
});

app.get('/backend/*', (req: Request, res: Response) => {
  console.log({path: '/backend/*'})
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
     .send({path: '/backend/*'});
});

app.listen(port, () => {
  console.log(`Server running at http://127.0.0.1:${port}`);
});

process.on('SIGINT', function() {
  console.log( "\nShutting down..." );
  process.exit();
});