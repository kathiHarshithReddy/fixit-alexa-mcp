import * as cdk from "aws-cdk-lib";
import { FixitStack } from "../lib/stack.js";
new FixitStack(new cdk.App(), "FixitStack", { env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION } });
