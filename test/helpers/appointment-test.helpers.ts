/**
 * Test helpers for M4 e2e tests.
 *
 * Provides seed utilities and JWT token minting that bypass the full
 * auth flow (bcrypt, cookies, etc.) for speed.
 */
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { v4 as uuid } from 'uuid';

// ──────────────────────────────────────────────────────────────────────────────
// Token minting
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Mint an access token cookie string for the given user, bypassing
 * the full login flow. Returns the cookie value to set on supertest.
 */
export async function mintAccessToken(
  app: INestApplication,
  userId: string,
  role: string,
): Promise<string> {
  const jwt = app.get(JwtService);
  const config = app.get(ConfigService);

  const token = await jwt.signAsync(
    { sub: userId, role },
    {
      secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: '1h',
    },
  );

  return `accessToken=${token}`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Seed helpers
// ──────────────────────────────────────────────────────────────────────────────

export interface SeededDoctor {
  userId: string;
  profileId: string;
  cookie: string;
}

export interface SeededPatient {
  userId: string;
  profileId: string;
  cookie: string;
}

/**
 * Creates a doctor user + profile with one recurring availability rule.
 * Returns the IDs and cookie string for supertest.
 */
export async function seedDoctor(
  app: INestApplication,
  overrides: {
    weekday?: number;
    startTime?: string;
    endTime?: string;
    slotMinutes?: number;
    perHourRate?: number;
  } = {},
): Promise<SeededDoctor> {
  const db = app.get(PrismaService);
  const id = uuid();

  const user = await db.user.create({
    data: {
      id,
      username: `dr-${id.slice(0, 8)}`,
      email: `dr-${id.slice(0, 8)}@test.local`,
      password: '$2a$12$dummyhashfortestonly............................',
      role: 'DOCTOR',
      country: 'GH',
      gender: 'MALE',
      city: 'Accra',
      timezone: 'Africa/Accra',
      emailVerified: new Date(),
    },
  });

  const profile = await db.doctorProfile.create({
    data: {
      userId: user.id,
      yearsOfExperience: 5,
      educationLevel: 'MD',
      institution: 'KNUST',
      perHourRate: overrides.perHourRate ?? 30000,
      appointmentSlotMinutes: overrides.slotMinutes ?? 60,
      modeOfConsultation: 'BOTH',
      published: true,
      availability: {
        create: [
          {
            kind: 'RECURRING',
            weekday: overrides.weekday ?? 1, // Monday
            startTime: overrides.startTime ?? '08:00',
            endTime: overrides.endTime ?? '17:00',
            isActive: true,
          },
        ],
      },
    },
  });

  const cookie = await mintAccessToken(app, user.id, 'DOCTOR');

  return { userId: user.id, profileId: profile.id, cookie };
}

/**
 * Creates a patient user + profile.
 * Returns the IDs and cookie string for supertest.
 */
export async function seedPatient(
  app: INestApplication,
): Promise<SeededPatient> {
  const db = app.get(PrismaService);
  const id = uuid();

  const user = await db.user.create({
    data: {
      id,
      username: `patient-${id.slice(0, 8)}`,
      email: `patient-${id.slice(0, 8)}@test.local`,
      password: '$2a$12$dummyhashfortestonly............................',
      role: 'PATIENT',
      country: 'GH',
      gender: 'MALE',
      city: 'Accra',
      timezone: 'Africa/Accra',
      emailVerified: new Date(),
    },
  });

  await db.patientProfile.create({
    data: {
      userId: user.id,
      dateOfBirth: new Date('1990-01-01'),
    },
  });

  const profile = await db.patientProfile.findUniqueOrThrow({
    where: { userId: user.id },
  });

  const cookie = await mintAccessToken(app, user.id, 'PATIENT');

  return { userId: user.id, profileId: profile.id, cookie };
}

/**
 * Wipe all appointment-related data. Called between test groups.
 * Does NOT wipe users/profiles — those are reused.
 */
export async function cleanAppointments(
  app: INestApplication,
): Promise<void> {
  const db = app.get(PrismaService);
  await db.appointmentLog.deleteMany();
  await db.appointment.deleteMany();
}

/**
 * Compute a future Monday at a given hour for test slots.
 * Ensures the slot is always in the future.
 */
export function nextMonday(hour: number = 10): { start: Date; end: Date } {
  const now = new Date();
  const day = now.getUTCDay();
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
  const monday = new Date(now);
  monday.setUTCDate(monday.getUTCDate() + daysUntilMonday);
  monday.setUTCHours(hour, 0, 0, 0);

  const end = new Date(monday);
  end.setUTCHours(hour + 1);

  return { start: monday, end };
}
