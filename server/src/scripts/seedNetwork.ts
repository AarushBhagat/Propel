import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

// For Prisma 7+ local execution
import * as dotenv from 'dotenv';
dotenv.config({ path: '../../.env' }); // Make sure env vars are loaded

const connectionString = process.env.DATABASE_URL || 'postgresql://user:password@localhost:5433/fault_localization?schema=public';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ----------------------------------------------------------------------------
// Simple Deterministic Random Generator (LCG)
// Ensures the generated network is identical every time it runs.
// ----------------------------------------------------------------------------
let seed = 12345;
function random() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

function randomInt(min: number, max: number) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number) {
  return random() * (max - min) + min;
}

// ----------------------------------------------------------------------------
// Main Seeder Function
// ----------------------------------------------------------------------------
async function main() {
  console.log('Cleaning existing data...');
  // Delete in correct order to avoid foreign key constraint errors
  await prisma.scheduledOutage.deleteMany();
  await prisma.incidentPole.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.telemetry.deleteMany();
  await prisma.pole.deleteMany();
  await prisma.transformer.deleteMany();
  await prisma.feeder.deleteMany();

  console.log('Generating Feeders...');
  const feeders = [];
  for (let i = 1; i <= 4; i++) {
    feeders.push({
      id: `F-0${i}`,
    });
  }
  await prisma.feeder.createMany({ data: feeders });

  console.log('Generating Distribution Transformers (DTs)...');
  const dts = [];
  let dtCount = 1;

  // Base coordinates for the city (e.g., Bangalore)
  const cityLat = 12.9716;
  const cityLon = 77.5946;

  for (const feeder of feeders) {
    // 5 DTs per feeder = 20 total
    for (let i = 0; i < 5; i++) {
      dts.push({
        id: `D-${dtCount.toString().padStart(4, '0')}`,
        feederId: feeder.id,
        // Spread transformers across a ~5km radius
        lat: cityLat + randomFloat(-0.05, 0.05),
        lon: cityLon + randomFloat(-0.05, 0.05),
        capacityKva: 250,
        householdsServed: randomInt(100, 400),
      });
      dtCount++;
    }
  }
  await prisma.transformer.createMany({ data: dts });

  console.log('Generating Poles...');
  let currentPoleId = 1;
  const allPoles = [];
  let missingTopologyCount = 0;

  for (const dt of dts) {
    // The assignment requires ~60% of DTs to have missing topology
    const isMissingTopology = random() < 0.60;
    if (isMissingTopology) missingTopologyCount++;

    const numPoles = randomInt(125, 175); // Total poles per DT
    
    // We maintain a list of active parents to build branches
    const availableParents: any[] = [];
    
    for (let i = 0; i < numPoles; i++) {
      let lat = dt.lat;
      let lon = dt.lon;
      let parentPoleId = null;
      let seqOnLine = null;
      let parentIdx = -1;

      if (i === 0) {
        // First pole sits exactly at the DT
        seqOnLine = 1;
      } else {
        // Build the tree: 80% chance to continue the current line, 20% to branch off an older node
        parentIdx = availableParents.length - 1;
        if (random() < 0.20 && availableParents.length > 1) {
          parentIdx = randomInt(0, availableParents.length - 2);
        }
        
        const parent = availableParents[parentIdx];
        
        // Offset by roughly 20-30 meters
        lat = parent.lat + randomFloat(-0.0003, 0.0003);
        lon = parent.lon + randomFloat(-0.0003, 0.0003);
        
        if (!isMissingTopology) {
          parentPoleId = parent.id;
          seqOnLine = parent.seqOnLine + 1;
        }

        // Increment children count on parent, cap at 3 branches per pole
        parent.childrenCount++;
        if (parent.childrenCount >= 3) {
          availableParents.splice(parentIdx, 1);
        }
      }

      // ~9% of poles do not have a device
      const hasDevice = random() > 0.09;

      const pole = {
        id: `P-${currentPoleId.toString().padStart(6, '0')}`,
        feederId: dt.feederId,
        dtId: dt.id,
        lat,
        lon,
        seqOnLine: isMissingTopology ? null : seqOnLine,
        parentPoleId,
        poleType: 'LT-9m-PCC',
        ward: 'W-084',
        pincode: '560078',
        deviceId: hasDevice ? `DEV-P-${currentPoleId}` : null,
        childrenCount: 0, // Temporary tracking property
      };

      allPoles.push(pole);
      availableParents.push(pole);
      currentPoleId++;
    }
  }

  // We can't use createMany for self-referencing tables easily if the ordering isn't guaranteed by the DB bulk insert.
  // Instead, we insert sequentially in a transaction. Since they are topologically sorted, parents always exist first.
  console.log(`Inserting ${allPoles.length} poles...`);
  
  // Clean up temporary property before insertion
  const cleanPoles = allPoles.map(({ childrenCount, ...rest }) => rest);
  
  // Chunking the inserts to avoid transaction limits and speed up execution
  const chunkSize = 500;
  for (let i = 0; i < cleanPoles.length; i += chunkSize) {
    const chunk = cleanPoles.slice(i, i + chunkSize);
    // Since we created them in topological order, we can just await each creation 
    // to guarantee parent foreign keys exist. 
    for(const pole of chunk) {
        await prisma.pole.create({ data: pole });
    }
    console.log(`Inserted ${Math.min(i + chunkSize, cleanPoles.length)} / ${cleanPoles.length}`);
  }

  console.log('\n--- Seeding Complete ---');
  console.log(`Total Feeders: 4`);
  console.log(`Total DTs: 20`);
  console.log(`Total Poles: ${allPoles.length}`);
  console.log(`DTs missing topology: ${missingTopologyCount} / 20 (${((missingTopologyCount/20)*100).toFixed(1)}%)`);
  
  const devicesCount = allPoles.filter(p => p.deviceId !== null).length;
  console.log(`Poles with devices: ${devicesCount} / ${allPoles.length} (${((devicesCount/allPoles.length)*100).toFixed(1)}%)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
