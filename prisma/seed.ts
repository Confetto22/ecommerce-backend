/* eslint-disable no-console */
import 'dotenv/config';
import { hash } from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaClient,
  Role,
  GenderType,
  consultationTypes,
} from '../generated/prisma/client';

/**
 * Idempotent dev seed.
 *
 * Run with:
 *   npx prisma db seed
 *
 * Re-running is safe: every row is upserted by a natural unique key
 * (email for users, userId for patient/doctor profiles). Doctor weekly
 * availability is fully replaced on each run so it stays deterministic.
 *
 * Refuses to run in production unless ALLOW_PROD_SEED=true is set.
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to run the seed');
}

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const SEED_PASSWORD = 'Password123!';

type DoctorSeed = {
  email: string;
  username: string;
  gender: GenderType;
  city: string;
  country: string;
  phone?: string;
  timezone: string;
  photo?: string;
  doctor: {
    yearsOfExperience: number;
    educationLevel: string;
    institution: string;
    /** Money in pesewas (GHS minor units). */
    perHourRate: number;
    appointmentSlotMinutes?: number;
    bio?: string;
    published?: boolean;
    specialties: string[];
    languages: string[];
    modeOfConsultation: consultationTypes;
    /** Weekly recurring availability in doctor's local TZ. */
    weeklyAvailability?: Array<{
      weekday: number;
      start: string;
      end: string;
    }>;
  };
};

type PatientSeed = {
  email: string;
  username: string;
  gender: GenderType;
  city: string;
  country: string;
  phone?: string;
  timezone: string;
  photo?: string;
  patient: {
    dateOfBirth: string;
    bloodType?: string;
    allergies?: string[];
    medicalConditions?: string[];
    emergencyContactName?: string;
    emergencyContactPhone?: string;
  };
};

const DOCTORS: DoctorSeed[] = [
  {
    email: 'dr.akosua.mensah@example.com',
    username: 'Dr. Akosua Mensah',
    gender: 'FEMALE',
    city: 'Accra',
    country: 'Ghana',
    phone: '+233241000001',
    timezone: 'Africa/Accra',
    doctor: {
      yearsOfExperience: 12,
      educationLevel: 'MBChB, FWACP (Cardiology)',
      institution: 'Korle Bu Teaching Hospital',
      perHourRate: 25000,
      appointmentSlotMinutes: 30,
      bio: 'Consultant cardiologist focused on preventive care and managing hypertension in adults.',
      published: true,
      specialties: ['cardiology', 'internal medicine'],
      languages: ['en', 'tw'],
      modeOfConsultation: 'BOTH',
      weeklyAvailability: [
        { weekday: 1, start: '09:00', end: '12:00' },
        { weekday: 1, start: '14:00', end: '17:00' },
        { weekday: 3, start: '09:00', end: '12:00' },
        { weekday: 3, start: '14:00', end: '17:00' },
        { weekday: 5, start: '09:00', end: '13:00' },
      ],
    },
  },
  {
    email: 'dr.kwame.asante@example.com',
    username: 'Dr. Kwame Asante',
    gender: 'MALE',
    city: 'Kumasi',
    country: 'Ghana',
    phone: '+233241000002',
    timezone: 'Africa/Accra',
    doctor: {
      yearsOfExperience: 8,
      educationLevel: 'MBChB, FWACP (Paediatrics)',
      institution: 'Komfo Anokye Teaching Hospital',
      perHourRate: 18000,
      appointmentSlotMinutes: 30,
      bio: 'Paediatrician with a special interest in childhood asthma and developmental milestones.',
      published: true,
      specialties: ['pediatrics'],
      languages: ['en', 'tw'],
      modeOfConsultation: 'IN_PERSON',
      weeklyAvailability: [
        { weekday: 1, start: '08:00', end: '13:00' },
        { weekday: 2, start: '08:00', end: '13:00' },
        { weekday: 4, start: '08:00', end: '13:00' },
        { weekday: 5, start: '08:00', end: '13:00' },
      ],
    },
  },
  {
    email: 'dr.ama.owusu@example.com',
    username: 'Dr. Ama Owusu',
    gender: 'FEMALE',
    city: 'Accra',
    country: 'Ghana',
    phone: '+233241000003',
    timezone: 'Africa/Accra',
    doctor: {
      yearsOfExperience: 6,
      educationLevel: 'MBChB, MSc Dermatology (UK)',
      institution: 'Private practice',
      perHourRate: 30000,
      appointmentSlotMinutes: 30,
      bio: 'Virtual-first dermatology practice. Acne, eczema, and pigmentation reviews.',
      published: true,
      specialties: ['dermatology'],
      languages: ['en', 'fr'],
      modeOfConsultation: 'VIRTUAL',
      weeklyAvailability: [
        { weekday: 2, start: '17:00', end: '20:00' },
        { weekday: 3, start: '17:00', end: '20:00' },
        { weekday: 4, start: '17:00', end: '20:00' },
        { weekday: 6, start: '10:00', end: '14:00' },
      ],
    },
  },
  {
    email: 'dr.yaw.boateng@example.com',
    username: 'Dr. Yaw Boateng',
    gender: 'MALE',
    city: 'Accra',
    country: 'Ghana',
    phone: '+233241000004',
    timezone: 'Africa/Accra',
    doctor: {
      yearsOfExperience: 15,
      educationLevel: 'MBChB, FWACP (Psychiatry)',
      institution: 'Accra Psychiatric Hospital',
      perHourRate: 40000,
      appointmentSlotMinutes: 60,
      bio: 'Adult psychiatry: anxiety, depression, and burnout. Confidential, evidence-based care.',
      published: true,
      specialties: ['psychiatry', 'mental health'],
      languages: ['en'],
      modeOfConsultation: 'BOTH',
      weeklyAvailability: [
        { weekday: 1, start: '10:00', end: '16:00' },
        { weekday: 3, start: '10:00', end: '16:00' },
        { weekday: 5, start: '10:00', end: '16:00' },
      ],
    },
  },
  {
    email: 'dr.efua.darko@example.com',
    username: 'Dr. Efua Darko',
    gender: 'FEMALE',
    city: 'Tema',
    country: 'Ghana',
    phone: '+233241000005',
    timezone: 'Africa/Accra',
    doctor: {
      yearsOfExperience: 4,
      educationLevel: 'MBChB',
      institution: 'University of Ghana Medical School',
      perHourRate: 12000,
      appointmentSlotMinutes: 30,
      bio: 'General practice. Routine check-ups, prescriptions, referrals.',
      published: false,
      specialties: ['general practice', 'family medicine'],
      languages: ['en', 'tw'],
      modeOfConsultation: 'IN_PERSON',
      weeklyAvailability: [
        { weekday: 1, start: '09:00', end: '17:00' },
        { weekday: 2, start: '09:00', end: '17:00' },
        { weekday: 3, start: '09:00', end: '17:00' },
        { weekday: 4, start: '09:00', end: '17:00' },
        { weekday: 5, start: '09:00', end: '13:00' },
      ],
    },
  },
];

const PATIENTS: PatientSeed[] = [
  {
    email: 'jane.smith@example.com',
    username: 'Jane Smith',
    gender: 'FEMALE',
    city: 'Accra',
    country: 'Ghana',
    phone: '+233209998801',
    timezone: 'Africa/Accra',
    patient: {
      dateOfBirth: '1990-06-15',
      bloodType: 'O+',
      allergies: ['penicillin'],
      medicalConditions: ['hypertension'],
      emergencyContactName: 'Kwame Smith',
      emergencyContactPhone: '+233209998802',
    },
  },
  {
    email: 'kojo.appiah@example.com',
    username: 'Kojo Appiah',
    gender: 'MALE',
    city: 'Kumasi',
    country: 'Ghana',
    phone: '+233209998803',
    timezone: 'Africa/Accra',
    patient: {
      dateOfBirth: '1985-02-09',
      bloodType: 'A+',
      medicalConditions: ['type 2 diabetes'],
      emergencyContactName: 'Ama Appiah',
      emergencyContactPhone: '+233209998804',
    },
  },
  {
    email: 'abena.koranteng@example.com',
    username: 'Abena Koranteng',
    gender: 'FEMALE',
    city: 'Accra',
    country: 'Ghana',
    phone: '+233209998805',
    timezone: 'Africa/Accra',
    patient: {
      dateOfBirth: '1998-11-22',
      bloodType: 'B+',
      allergies: ['shellfish'],
    },
  },
  {
    email: 'samuel.tetteh@example.com',
    username: 'Samuel Tetteh',
    gender: 'MALE',
    city: 'Tema',
    country: 'Ghana',
    timezone: 'Africa/Accra',
    patient: {
      dateOfBirth: '1972-04-03',
      bloodType: 'AB+',
      medicalConditions: ['asthma'],
      emergencyContactName: 'Mary Tetteh',
      emergencyContactPhone: '+233209998807',
    },
  },
  {
    email: 'naa.adjei@example.com',
    username: 'Naa Adjei',
    gender: 'FEMALE',
    city: 'Accra',
    country: 'Ghana',
    phone: '+233209998808',
    timezone: 'Africa/Accra',
    patient: {
      dateOfBirth: '2002-08-30',
    },
  },
  {
    email: 'ibrahim.mahama@example.com',
    username: 'Ibrahim Mahama',
    gender: 'MALE',
    city: 'Tamale',
    country: 'Ghana',
    phone: '+233209998809',
    timezone: 'Africa/Accra',
    patient: {
      dateOfBirth: '1979-12-12',
      bloodType: 'O-',
      allergies: ['sulfa drugs'],
      medicalConditions: ['migraines'],
      emergencyContactName: 'Hawa Mahama',
      emergencyContactPhone: '+233209998810',
    },
  },
];

async function main() {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_PROD_SEED !== 'true'
  ) {
    throw new Error(
      'Refusing to seed in production. Set ALLOW_PROD_SEED=true to override.',
    );
  }

  console.log(`\nSeeding (${process.env.NODE_ENV ?? 'development'})…\n`);

  const password = await hash(SEED_PASSWORD, 12);

  for (const d of DOCTORS) {
    const user = await db.user.upsert({
      where: { email: d.email },
      update: {
        username: d.username,
        gender: d.gender,
        city: d.city,
        country: d.country,
        phone: d.phone ?? null,
        timezone: d.timezone,
        photo: d.photo ?? null,
        role: Role.DOCTOR,
      },
      create: {
        email: d.email,
        username: d.username,
        password,
        role: Role.DOCTOR,
        gender: d.gender,
        city: d.city,
        country: d.country,
        phone: d.phone,
        timezone: d.timezone,
        photo: d.photo,
      },
    });

    const profile = await db.doctorProfile.upsert({
      where: { userId: user.id },
      update: {
        yearsOfExperience: d.doctor.yearsOfExperience,
        educationLevel: d.doctor.educationLevel,
        institution: d.doctor.institution,
        perHourRate: d.doctor.perHourRate,
        appointmentSlotMinutes: d.doctor.appointmentSlotMinutes ?? 30,
        bio: d.doctor.bio,
        published: d.doctor.published ?? false,
        specialties: d.doctor.specialties,
        languages: d.doctor.languages,
        modeOfConsultation: d.doctor.modeOfConsultation,
      },
      create: {
        userId: user.id,
        yearsOfExperience: d.doctor.yearsOfExperience,
        educationLevel: d.doctor.educationLevel,
        institution: d.doctor.institution,
        perHourRate: d.doctor.perHourRate,
        appointmentSlotMinutes: d.doctor.appointmentSlotMinutes ?? 30,
        bio: d.doctor.bio,
        published: d.doctor.published ?? false,
        specialties: d.doctor.specialties,
        languages: d.doctor.languages,
        modeOfConsultation: d.doctor.modeOfConsultation,
      },
    });

    if (d.doctor.weeklyAvailability?.length) {
      await db.doctorAvailability.deleteMany({
        where: { doctorId: profile.id },
      });
      await db.doctorAvailability.createMany({
        data: d.doctor.weeklyAvailability.map((a) => ({
          doctorId: profile.id,
          weekday: a.weekday,
          startTime: a.start,
          endTime: a.end,
        })),
      });
    }

    console.log(
      `  doctor   ${d.email.padEnd(36)} ${
        d.doctor.published ? 'published' : 'draft   '
      }  [${profile.specialties.join(', ')}]`,
    );
  }

  for (const p of PATIENTS) {
    const user = await db.user.upsert({
      where: { email: p.email },
      update: {
        username: p.username,
        gender: p.gender,
        city: p.city,
        country: p.country,
        phone: p.phone ?? null,
        timezone: p.timezone,
        photo: p.photo ?? null,
        role: Role.PATIENT,
      },
      create: {
        email: p.email,
        username: p.username,
        password,
        role: Role.PATIENT,
        gender: p.gender,
        city: p.city,
        country: p.country,
        phone: p.phone,
        timezone: p.timezone,
        photo: p.photo,
      },
    });

    await db.patientProfile.upsert({
      where: { userId: user.id },
      update: {
        dateOfBirth: new Date(p.patient.dateOfBirth),
        bloodType: p.patient.bloodType,
        allergies: p.patient.allergies ?? [],
        medicalConditions: p.patient.medicalConditions ?? [],
        emergencyContactName: p.patient.emergencyContactName,
        emergencyContactPhone: p.patient.emergencyContactPhone,
      },
      create: {
        userId: user.id,
        dateOfBirth: new Date(p.patient.dateOfBirth),
        bloodType: p.patient.bloodType,
        allergies: p.patient.allergies ?? [],
        medicalConditions: p.patient.medicalConditions ?? [],
        emergencyContactName: p.patient.emergencyContactName,
        emergencyContactPhone: p.patient.emergencyContactPhone,
      },
    });

    console.log(`  patient  ${p.email}`);
  }

  console.log(
    `\nDone. ${DOCTORS.length} doctor(s), ${PATIENTS.length} patient(s).`,
  );
  console.log(`All seeded users share the password: ${SEED_PASSWORD}\n`);
}

main()
  .catch((e) => {
    console.error('\nSeed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
