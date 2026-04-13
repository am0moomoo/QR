import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await hash("DemoPass123!", 12);

  const user = await prisma.user.upsert({
    where: {
      email: "demo@qrflow.local"
    },
    update: {
      fullName: "Demo Owner",
      locale: "en",
      passwordHash
    },
    create: {
      email: "demo@qrflow.local",
      fullName: "Demo Owner",
      locale: "en",
      passwordHash
    }
  });

  const workspace = await prisma.workspace.upsert({
    where: {
      slug: "demo-owner"
    },
    update: {
      name: "Demo Owner workspace",
      ownerUserId: user.id
    },
    create: {
      name: "Demo Owner workspace",
      ownerUserId: user.id,
      slug: "demo-owner"
    }
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        userId: user.id,
        workspaceId: workspace.id
      }
    },
    update: {
      role: "OWNER"
    },
    create: {
      role: "OWNER",
      userId: user.id,
      workspaceId: workspace.id
    }
  });

  const qrCode = await prisma.qRCode.upsert({
    where: {
      slug: "demo-link"
    },
    update: {
      adsEnabled: true,
      doNotIndex: false,
      ownerUserId: user.id,
      title: "Demo QR"
    },
    create: {
      adsEnabled: true,
      doNotIndex: false,
      ownerUserId: user.id,
      slug: "demo-link",
      title: "Demo QR",
      type: "link",
      workspaceId: workspace.id
    }
  });

  await prisma.qRContent.upsert({
    where: {
      qrCodeId: qrCode.id
    },
    update: {
      payload: {
        link: "https://example.com/demo"
      },
      targetUrl: "https://example.com/demo"
    },
    create: {
      payload: {
        link: "https://example.com/demo"
      },
      qrCodeId: qrCode.id,
      targetUrl: "https://example.com/demo"
    }
  });

  await prisma.qRDesign.upsert({
    where: {
      qrCodeId: qrCode.id
    },
    update: {
      backgroundColor: "#ffffff",
      errorCorrection: "M",
      patternColor: "#111111",
      quietZoneModules: 4,
      sizePx: 512
    },
    create: {
      backgroundColor: "#ffffff",
      errorCorrection: "M",
      patternColor: "#111111",
      qrCodeId: qrCode.id,
      quietZoneModules: 4,
      sizePx: 512
    }
  });

  console.log(
    JSON.stringify({
      seeded: true,
      user: user.email,
      workspaceSlug: workspace.slug,
      qrSlug: qrCode.slug
    })
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
