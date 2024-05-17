import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecrAssets from 'aws-cdk-lib/aws-ecr-assets';

interface CreateServiceProps {
  name: string
  asset: string
  port: number,
  desiredCount: number
  environment: {
    [key: string]: string;
  }
}

export class SampleEcsApplicationStack extends cdk.Stack {
  private cluster: ecs.Cluster;

  private createEcsService(props: CreateServiceProps): ecs.FargateService {
    const backendTaskDefinition = new ecs.TaskDefinition(this, `${props.name}-task-definition`, {
      cpu: '256',
      memoryMiB: '512',
      compatibility: ecs.Compatibility.FARGATE,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    })

    backendTaskDefinition.addContainer(`${props.name}-task-definition`, {
      image: ecs.ContainerImage.fromAsset(props.asset, {
        platform: ecrAssets.Platform.LINUX_AMD64
      }),
      portMappings: [{
        containerPort: props.port,
        hostPort: props.port
      }],
      containerName: `sample-ecs-application-${props.name}`,
      environment: props.environment,
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: props.name, logRetention: 1 }),
    })

    return new ecs.FargateService(this, `service-${props.name}`, {
      cluster: this.cluster,
      desiredCount: props.desiredCount,
      taskDefinition: backendTaskDefinition,
    })
  }

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

    const engine = rds.DatabaseInstanceEngine.postgres({
      version: rds.PostgresEngineVersion.VER_16_2,
    });

    const parameterGroup = new rds.ParameterGroup(
      this,
      "parameter-group",
      {
        engine,
        parameters: {
          "rds.force_ssl": "0",
        },
      }
    );

    const database = new rds.DatabaseInstance(this, 'database', {
      databaseName: 'sampleEcsApplication',
      credentials: rds.Credentials.fromSecret(secret, username),
      vpc,
      parameterGroup,
      vpcSubnets: vpc.selectSubnets({subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS}),
      engine: rds.DatabaseInstanceEngine.POSTGRES,
      autoMinorVersionUpgrade: true,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    this.cluster = new ecs.Cluster(this, 'cluster', {
      clusterName: 'sample-ecs-application',
      vpc,
      enableFargateCapacityProviders: true,
    })

    const lb = new elbv2.ApplicationLoadBalancer(this, 'loadbalancer', {
      loadBalancerName: 'sample-ecs-application',
      vpc,
      internetFacing: true,
    })

    const backend = this.createEcsService({
      name: 'backend',
      desiredCount: 2,
      port: 80,
      asset: './backend',
      environment: {
          PORT: '80',
          CORS_ORIGIN: '*',
          DB_SECRET_ARN: secret.secretArn,
        },
    })

    // allow task definition to read the secret
    secret.grantRead(backend.taskDefinition.taskRole)

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
      deregistrationDelay: cdk.Duration.seconds(0),
      healthCheck: {
        path: '/health'
      }
    })

    const frontend = this.createEcsService({
      name: 'frontend',
      desiredCount: 2,
      asset: './frontend',
      environment: {},
      port: 80
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
      deregistrationDelay: cdk.Duration.seconds(0),
      healthCheck: {
        healthyThresholdCount: 2,
      }
    })

    new cdk.CfnOutput(this, 'loadbalancerDns', { value: `http://${lb.loadBalancerDnsName}` });
  }
}
