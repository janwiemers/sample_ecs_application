import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPattern from 'aws-cdk-lib/aws-ecs-patterns'

export class SampleEcsApplicationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'vpc', {
      vpcName: 'sample-ecs-application',
      maxAzs: 2,
    })

    const username = 'root'
    const secret = new rds.DatabaseSecret(this, 'rds-secret', {
      username
    });

    const database = new rds.DatabaseInstance(this, 'database', {
      databaseName: 'sampleEcsApplication',
      credentials: rds.Credentials.fromSecret(secret, username),
      vpc,
      vpcSubnets: vpc.selectSubnets({subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS}),
      engine: rds.DatabaseInstanceEngine.POSTGRES,
      autoMinorVersionUpgrade: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    const cluster = new ecs.Cluster(this, 'cluster', {
      clusterName: 'sample-ecs-application',
      vpc,
      enableFargateCapacityProviders: true,
    })

    const lb = new elbv2.ApplicationLoadBalancer(this, 'loadbalancer', {
      loadBalancerName: 'sample-ecs-application',
      vpc,
      internetFacing: true,
    })

    const backendTaskDefinition = new ecs.TaskDefinition(this, 'backend-task-definition', {
      cpu: '256',
      memoryMiB: '512',
      compatibility: ecs.Compatibility.FARGATE,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    })

    backendTaskDefinition.addContainer('backend-task-definition', {
      image: ecs.ContainerImage.fromAsset('./backend', {
        buildArgs: {
          "--platform": "linux/arm64,linux/amd64",
        },
      }),
      portMappings: [{
        containerPort: 80,
        hostPort: 80
      }],
      containerName: 'sample-ecs-application-backend',
      environment: {
        PORT: '80',
        CORS_ORIGIN: '*',
        DB_SECRET_ARN: secret.secretArn,
        DATABASE_HOST: database.dbInstanceEndpointAddress,
        DATABASE_PORT: database.dbInstanceEndpointPort,
      },
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'sample-ecs-application-backend', logRetention: 1 }),
    })

    const backend = new ecs.FargateService(this, 'backend', {
      cluster,
      desiredCount: 2,
      taskDefinition: backendTaskDefinition,
    })

    secret.grantRead(backendTaskDefinition.taskRole)

    // Allow connections from the backend service
    database.connections.allowDefaultPortFrom(backend)

    const listener = lb.addListener('listener', {
      port: 80,
      defaultAction: elbv2.ListenerAction.fixedResponse(400)
    })

    listener.addTargets('backend', {
      priority: 10,
      protocol: elbv2.ApplicationProtocol.HTTP,
      conditions: [
        elbv2.ListenerCondition.pathPatterns(['/backend/*']),
      ],
      targets: [backend.loadBalancerTarget({
        containerName: 'sample-ecs-application-backend',
        containerPort: 80
      })],
      healthCheck: {
        path: '/health'
      }
    })

    // Frontend
    const frontendTaskDefinition = new ecs.TaskDefinition(this, 'frontend-task-definition', {
      cpu: '256',
      memoryMiB: '512',
      compatibility: ecs.Compatibility.FARGATE,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    })

    frontendTaskDefinition.addContainer('frontend-task-definition', {
      image: ecs.ContainerImage.fromAsset('./frontend', {
        buildArgs: {
          "--platform": "linux/arm64,linux/amd64",
        },
      }),
      portMappings: [{
        containerPort: 80,
        hostPort: 80
      }],
      containerName: 'sample-ecs-application-frontend',
      environment: {
        PORT: '80',
        CORS_ORIGIN: '*',
        DATABASE_HOST: database.dbInstanceEndpointAddress,
        DATABASE_PORT: database.dbInstanceEndpointPort,
      },
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'sample-ecs-application-frontend', logRetention: 1 }),
    })

    const frontend = new ecs.FargateService(this, 'frontend', {
      cluster,
      desiredCount: 2,
      taskDefinition: frontendTaskDefinition,
    })

    listener.addTargets('frontend', {
      priority: 20,
      protocol: elbv2.ApplicationProtocol.HTTP,
      conditions: [
        elbv2.ListenerCondition.pathPatterns(['/']),
      ],
      targets: [frontend.loadBalancerTarget({
        containerName: 'sample-ecs-application-frontend',
        containerPort: 80
      })],
      deregistrationDelay: cdk.Duration.seconds(5),
      healthCheck: {
        healthyThresholdCount: 2,
      }
    })

    new cdk.CfnOutput(this, 'loadbalancerDns', { value: `http://${lb.loadBalancerDnsName}` });
  }
}
