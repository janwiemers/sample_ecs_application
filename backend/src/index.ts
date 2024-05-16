import express, { Request, Response } from 'express';
import cors from 'cors';
import postgres from 'postgres'
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { uniqueNamesGenerator, starWars } from 'unique-names-generator';

const app = express();

const client = new SecretsManagerClient({
  region: process.env.REGION || 'eu-central-1'
});

const port = process.env.PORT || 3000;
const corsOrigin     = process.env.CORS_ORIGIN || '*';
var databaseHost     = process.env.DATABASE_HOST
var databaseName     = process.env.DATABASE_NAME
var databaseUser     = process.env.DATABASE_USERNAME
var databasePassword = process.env.DATABASE_PASSWORD

if(process.env.DB_SECRET_ARN) {
  const command = new GetSecretValueCommand({
    SecretId: process.env.DB_SECRET_ARN
  });
  const response = await client.send(command);
  const secrets = JSON.parse(response.SecretString!)

  let {password, dbname, host, username } = secrets

  databaseHost = host
  databaseName = dbname
  databaseUser = username
  databasePassword = password
}

const sql = postgres(`postgres://${databaseUser}:${databasePassword}@${databaseHost}:5432/${databaseName}`)

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
  const count = (await sql`SELECT COUNT(id) FROM ${ sql(tableName) }`)
  const result = (await sql`SELECT name FROM ${ sql(tableName) } ORDER BY id DESC`).map((row: postgres.Row) => {
    return row.name
  })

  res.setHeader('Content-Type', 'application/json; charset=utf-8')
     .send({path: '/backend/records', names: result, count: count[0].count});
})

app.get('/backend/record/add', async (req: Request, res: Response) => {
  const shortName = uniqueNamesGenerator({
    dictionaries: [starWars],
  });
  const result = await sql`INSERT INTO ${ sql(tableName) } ${sql({ name: shortName})}`

  res.setHeader('Content-Type', 'application/json; charset=utf-8')
     .send({path: '/backend/record/add', method: 'GET', value: {name: shortName}});
})

app.get('/backend/records/clean', async (req: Request, res: Response) => {
  const result = await sql`TRUNCATE TABLE ${ sql(tableName) }`

  res.setHeader('Content-Type', 'application/json; charset=utf-8')
     .send({path: '/backend/records/clean', method: 'GET', value: result});
})

app.listen(port, () => {
  console.log(`Server running at http://127.0.0.1:${port}`);
});

process.on('SIGINT', function() {
  console.log( "\nShutting down..." );
  process.exit();
});