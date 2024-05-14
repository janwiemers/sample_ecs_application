import express, { Request, Response } from 'express';
import cors from 'cors';
import postgres from 'postgres'
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
const app = express();

const client = new SecretsManagerClient({
  region: process.env.REGION || 'eu-central-1'
});

const port = process.env.PORT || 3000;
const corsOrigin     = process.env.CORS_ORIGIN || '*';
let databaseHost     = process.env.DATABASE_HOST || undefined
let databaseName     = process.env.DATABASE_NAME || undefined
let databaseUser     = process.env.DATABASE_USERNAME || undefined
let databasePassword = process.env.DATABASE_PASSWORD || undefined


if(!databaseHost) {
  const command = new GetSecretValueCommand({
    SecretId: process.env.DB_SECRET_ARN
  });
  const response = await client.send(command);
  let {password, dbname, host, username } = JSON.parse(response.SecretString!)

  databaseHost = host
  databaseName = dbname
  databaseUser = username
  databasePassword = password
}

const sql = postgres(`postgres://${databaseUser}:${databasePassword}@${databaseHost}:5432/${databaseName}`, {
  host     : databaseHost,
  port     : 5432,
  database : databaseName,
  username : databaseUser,
  password : databasePassword,
})

const tableName = 'my_table'

await sql`CREATE TABLE IF NOT EXISTS ${ sql(tableName) } (id serial primary key, name text)`

app.use(cors({
  origin: corsOrigin
}))

app.get('/health', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
     .send({path: '/health'});
});

app.get('/backend/records', async (req: Request, res: Response) => {
  const result = await sql`SELECT COUNT(id) FROM ${ sql(tableName) }`

  res.setHeader('Content-Type', 'application/json; charset=utf-8')
     .send({path: '/backend/records', method: 'GET', value: result});
})

app.get('/backend/record/add', async (req: Request, res: Response) => {
  const result = await sql`INSERT INTO ${ sql(tableName) } ${sql({ name: Date.now()})}`

  res.setHeader('Content-Type', 'application/json; charset=utf-8')
     .send({path: '/health', method: 'GET', value: result});
})

app.listen(port, () => {
  console.log(`Server running at http://127.0.0.1:${port}`);
});

process.on('SIGINT', function() {
  console.log( "\nShutting down..." );
  process.exit();
});