import * as cdk from "aws-cdk-lib";
import * as ddb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import path from "path";
import { fileURLToPath } from "url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
export class FixitStack extends cdk.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    const table = new ddb.Table(this, "Home", { partitionKey: { name: "pk", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST, removalPolicy: cdk.RemovalPolicy.DESTROY });
    const fn = new NodejsFunction(this, "Mcp", { entry: path.join(root, "server/lambda.js"), projectRoot: root,
      depsLockFilePath: path.join(root, "package-lock.json"), runtime: lambda.Runtime.NODEJS_20_X, memorySize: 512, timeout: cdk.Duration.seconds(30),
      environment: { TABLE_NAME: table.tableName, USE_BEDROCK: "1", BEDROCK_MODEL_ID: process.env.BEDROCK_MODEL_ID || "apac.amazon.nova-lite-v1:0" },
      bundling: { commandHooks: { beforeBundling: () => [], beforeInstall: () => [], afterBundling: (i, o) => [`cp -r ${i}/web ${o}/web`] } } });
    table.grantReadWriteData(fn);
    fn.addToRolePolicy(new iam.PolicyStatement({ actions: ["bedrock:InvokeModel"], resources: ["*"] }));
    const url = fn.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.NONE });
    new cdk.CfnOutput(this, "Url", { value: url.url });
  }
}
