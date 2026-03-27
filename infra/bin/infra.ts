#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { NwtStack } from "../lib/nwt-stack";

const app = new cdk.App();

new NwtStack(app, "NwtStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: "us-east-1",
  },
});
