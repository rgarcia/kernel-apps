import { Kernel, type KernelContext } from '@onkernel/sdk';
import FastSpeedtest from "fast-speedtest-api";

const kernel = new Kernel();

const app = kernel.app('speedtest');

interface FastOutput {
  Mbps: string
}

app.action(
  'fast',
  async (ctx: KernelContext): Promise<FastOutput> => {
    const speedtest = new FastSpeedtest({
      token: "YXNkZmFzZGxmbnNkYWZoYXNkZmhrYWxm",
      verbose: true,
      timeout: 10000,
      https: true,
      urlCount: 5,
      bufferSize: 8,
      unit: FastSpeedtest.UNITS.Mbps,
      //proxy: 'http://optional:auth@my-proxy:123' 
    });

    const s = await speedtest.getSpeed()
    console.log(`Speed: ${s} Mbps`);
    return { Mbps: s }
  }
);

