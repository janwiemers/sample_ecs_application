# Sample ECS application Stack

This sample ECS setup deploys two containers to an ECS cluster using the fargate capacity provider as well as a postgres database to the private networks of the VPC.
It'll allow the backend container to connect to the database using credentials stored in the secrets manager and makes it available through a frontend. All of the containers are hosted behind a internetfacing ApplicationLoadbalancer deployed in the public subnets.

## Architecture

![Architecture](./docs/lab_arch.png)

## Structure

This repository contains everything needed to deploy the application.


### `/backend`

Contains the express backend application responsible for handling the API requests and connect to the database. The application is written in typescript using the [express](https://expressjs.com/) web framework.a

### `/frontend`

Represents the sample frontend layer and is a static web html webpage.

### `/lib`

Contains the AWS Cloud Development Kit (CDK) code and is the infrastructure as code part of the deployment by orchestrating the infrastructure and building the container assets required.

## Local Development

This repository contains a `docker compose` stack that can be used for local development. This is a very typical setup for applications operated in containers.

The stack consists out of a database `db` service the `backend` as well as the `frontend` service. The Main entry point here will the the frontend service which is an [nginx](https://nginx.org/) used to host the static html content as well as acting as a [reverse proxy ](https://en.wikipedia.org/wiki/Reverse_proxy) to access the express backend. The configuration for nginx is places in the `/nginx` folder.

### Prerequisites

- [Docker](https://www.docker.com/) or [Finch](https://github.com/runfinch/finch)

### Starting

```sh
# Starting
$ docker compose up

# Starting in deamon mode
$ docker compose up -d

# tailing logs for a single container
$ docker compose logs {container name} -f

# cleanup
$ docker compose down
```

## Deployment

```bash
# If not already initialized
$ npx cdk init

# deploy the stack
$ npx cdk deploy

# destroy the stack
$ npx cdk destroy
```
