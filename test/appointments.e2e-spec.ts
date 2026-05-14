import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { v4 as uuid } from 'uuid';
import {
  seedDoctor,
  seedPatient,
  cleanAppointments,
  nextMonday,
  SeededDoctor,
  SeededPatient,
} from './helpers/appointment-test.helpers';

describe('M4 Appointments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let doctor: SeededDoctor;
  let patient: SeededPatient;
  let patient2: SeededPatient;
  let slot: { start: Date; end: Date };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    const reflector = app.get(Reflector);
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalGuards(new JwtAuthGuard(reflector), new RolesGuard(reflector));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    slot = nextMonday(10);

    // Seed shared test data
    doctor = await seedDoctor(app);
    patient = await seedPatient(app);
    patient2 = await seedPatient(app);
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Helper: create a booking ──────────────────────────────────────────
  async function createBooking(
    patientCookie: string,
    doctorProfileId: string,
    start: Date,
    end: Date,
    idempotencyKey?: string,
  ) {
    return request(app.getHttpServer())
      .post('/api/appointments')
      .set('Cookie', patientCookie)
      .set('Idempotency-Key', idempotencyKey ?? uuid())
      .send({
        doctorId: doctorProfileId,
        scheduledStartAt: start.toISOString(),
        scheduledEndAt: end.toISOString(),
        conditionTitle: 'Test condition',
        context: 'Test context for e2e',
        type: 'VIRTUAL',
      });
  }

  // ══════════════════════════════════════════════════════════════════════
  // 1. BOOKING CREATION
  // ══════════════════════════════════════════════════════════════════════

  describe('POST /api/appointments — booking creation', () => {
    beforeEach(() => cleanAppointments(app));

    it('creates a PENDING appointment for a valid slot', async () => {
      const res = await createBooking(patient.cookie, doctor.profileId, slot.start, slot.end);
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PENDING');
      expect(res.body.doctorId).toBe(doctor.profileId);
      expect(res.body.patientId).toBe(patient.profileId);
      expect(res.body.priceAtBookingMinor).toBe(30000);
    });

    it('rejects when Idempotency-Key header is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/appointments')
        .set('Cookie', patient.cookie)
        .send({
          doctorId: doctor.profileId,
          scheduledStartAt: slot.start.toISOString(),
          scheduledEndAt: slot.end.toISOString(),
          conditionTitle: 'Test',
          context: 'Test',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('MISSING_IDEMPOTENCY_KEY');
    });

    it('rejects a slot in the past', async () => {
      const pastStart = new Date('2020-01-01T10:00:00Z');
      const pastEnd = new Date('2020-01-01T11:00:00Z');
      const res = await createBooking(patient.cookie, doctor.profileId, pastStart, pastEnd);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('SLOT_OUTSIDE_HORIZON');
    });

    it('creates a log entry with the booking', async () => {
      const res = await createBooking(patient.cookie, doctor.profileId, slot.start, slot.end);
      expect(res.status).toBe(201);
      const logs = await prisma.appointmentLog.findMany({
        where: { appointmentId: res.body.id },
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].previousStatus).toBe('PENDING');
      expect(logs[0].newStatus).toBe('PENDING');
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // 2. IDEMPOTENCY
  // ══════════════════════════════════════════════════════════════════════

  describe('Idempotency', () => {
    beforeEach(() => cleanAppointments(app));

    it('same Idempotency-Key returns the same appointment (no duplicate)', async () => {
      const key = uuid();
      const r1 = await createBooking(patient.cookie, doctor.profileId, slot.start, slot.end, key);
      const r2 = await createBooking(patient.cookie, doctor.profileId, slot.start, slot.end, key);

      expect(r1.status).toBe(201);
      expect(r2.status).toBe(201);
      expect(r1.body.id).toBe(r2.body.id);

      const count = await prisma.appointment.count({ where: { idempotencyKey: key } });
      expect(count).toBe(1);
    });

    it('concurrent requests with same key produce one row', async () => {
      const key = uuid();
      const [r1, r2] = await Promise.all([
        createBooking(patient.cookie, doctor.profileId, slot.start, slot.end, key),
        createBooking(patient.cookie, doctor.profileId, slot.start, slot.end, key),
      ]);

      expect(r1.body.id).toBe(r2.body.id);
      const count = await prisma.appointment.count({ where: { idempotencyKey: key } });
      expect(count).toBe(1);
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // 3. CONCURRENCY (the M4 acceptance test)
  // ══════════════════════════════════════════════════════════════════════

  describe('Concurrency — slot collision', () => {
    beforeEach(() => cleanAppointments(app));

    it('multiple parallel requests for the same slot → 1 success, rest 409', async () => {
      // Create multiple patients
      const patients = await Promise.all(
        Array.from({ length: 5 }).map(() => seedPatient(app)),
      );

      const responses = await Promise.all(
        patients.map((p) =>
          createBooking(p.cookie, doctor.profileId, slot.start, slot.end),
        ),
      );

      const winners = responses.filter((r) => r.status === 201);
      const losers = responses.filter((r) => r.status === 409);

      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(4);
      losers.forEach((r) => expect(r.body.error).toBe('SLOT_TAKEN'));

      // DB sanity: exactly one row
      const count = await prisma.appointment.count({
        where: { doctorId: doctor.profileId, scheduledStartAt: slot.start },
      });
      expect(count).toBe(1);
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // 4. LIFECYCLE TRANSITIONS
  // ══════════════════════════════════════════════════════════════════════

  describe('Lifecycle transitions', () => {
    let apptId: string;

    beforeEach(async () => {
      await cleanAppointments(app);
      const res = await createBooking(patient.cookie, doctor.profileId, slot.start, slot.end);
      apptId = res.body.id;
    });

    it('doctor approves a PENDING appointment', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/appointments/${apptId}/approve`)
        .set('Cookie', doctor.cookie);
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('APPROVED');
    });

    it('doctor rejects with reason → CANCELLED', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/appointments/${apptId}/reject`)
        .set('Cookie', doctor.cookie)
        .send({ reason: 'Schedule conflict' });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('CANCELLED');
      expect(res.body.reason).toBe('Schedule conflict');
    });

    it('patient cancels a PENDING appointment', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/appointments/${apptId}/cancel`)
        .set('Cookie', patient.cookie)
        .send({ reason: 'Changed my mind' });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('CANCELLED');
    });

    it('doctor cancels an APPROVED appointment', async () => {
      // First approve
      await request(app.getHttpServer())
        .post(`/api/appointments/${apptId}/approve`)
        .set('Cookie', doctor.cookie);
      // Then cancel
      const res = await request(app.getHttpServer())
        .post(`/api/appointments/${apptId}/cancel`)
        .set('Cookie', doctor.cookie)
        .send({ reason: 'Emergency' });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('CANCELLED');
    });

    it('non-participant cannot cancel → 403', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/appointments/${apptId}/cancel`)
        .set('Cookie', patient2.cookie)
        .send({});
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('NOT_APPOINTMENT_PARTICIPANT');
    });

    it('cannot approve a CANCELLED appointment → 409', async () => {
      // Cancel first
      await request(app.getHttpServer())
        .post(`/api/appointments/${apptId}/cancel`)
        .set('Cookie', patient.cookie)
        .send({});
      // Try to approve
      const res = await request(app.getHttpServer())
        .post(`/api/appointments/${apptId}/approve`)
        .set('Cookie', doctor.cookie);
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('INVALID_TRANSITION');
    });

    it('writes log entries for each transition', async () => {
      await request(app.getHttpServer())
        .post(`/api/appointments/${apptId}/approve`)
        .set('Cookie', doctor.cookie);

      const logs = await prisma.appointmentLog.findMany({
        where: { appointmentId: apptId },
        orderBy: { createdAt: 'asc' },
      });
      // Initial create log + approve log
      expect(logs).toHaveLength(2);
      expect(logs[0].newStatus).toBe('PENDING');
      expect(logs[1].previousStatus).toBe('PENDING');
      expect(logs[1].newStatus).toBe('APPROVED');
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // 5. RESCHEDULE FLOW
  // ══════════════════════════════════════════════════════════════════════

  describe('Reschedule flow', () => {
    let apptId: string;
    const altSlot = nextMonday(14); // 14:00-15:00

    beforeEach(async () => {
      await cleanAppointments(app);
      const res = await createBooking(patient.cookie, doctor.profileId, slot.start, slot.end);
      apptId = res.body.id;
    });

    it('doctor reschedules → RESCHEDULED with proposal', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/appointments/${apptId}/reschedule`)
        .set('Cookie', doctor.cookie)
        .send({
          proposedStartAt: altSlot.start.toISOString(),
          proposedEndAt: altSlot.end.toISOString(),
        });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('RESCHEDULED');
      expect(res.body.proposal.proposalRound).toBe(1);
    });

    it('patient accepts proposal → APPROVED with updated schedule', async () => {
      // Doctor proposes
      await request(app.getHttpServer())
        .post(`/api/appointments/${apptId}/reschedule`)
        .set('Cookie', doctor.cookie)
        .send({
          proposedStartAt: altSlot.start.toISOString(),
          proposedEndAt: altSlot.end.toISOString(),
        });

      // Patient accepts
      const res = await request(app.getHttpServer())
        .post(`/api/appointments/${apptId}/respond-to-reschedule`)
        .set('Cookie', patient.cookie)
        .send({ action: 'ACCEPT' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('APPROVED');
      expect(res.body.proposal.proposedStartAt).toBeNull();
    });

    it('patient cancels after reschedule → CANCELLED', async () => {
      await request(app.getHttpServer())
        .post(`/api/appointments/${apptId}/reschedule`)
        .set('Cookie', doctor.cookie)
        .send({
          proposedStartAt: altSlot.start.toISOString(),
          proposedEndAt: altSlot.end.toISOString(),
        });

      const res = await request(app.getHttpServer())
        .post(`/api/appointments/${apptId}/respond-to-reschedule`)
        .set('Cookie', patient.cookie)
        .send({ action: 'CANCEL', reason: 'Not convenient' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('CANCELLED');
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // 6. READ ENDPOINTS
  // ══════════════════════════════════════════════════════════════════════

  describe('Read endpoints', () => {
    let apptId: string;

    beforeEach(async () => {
      await cleanAppointments(app);
      const res = await createBooking(patient.cookie, doctor.profileId, slot.start, slot.end);
      apptId = res.body.id;
    });

    it('GET /api/appointments/me returns patient appointments', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/appointments/me')
        .set('Cookie', patient.cookie);
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.meta).toHaveProperty('total', 1);
      expect(res.body.items[0].id).toBe(apptId);
    });

    it('GET /api/appointments/inbox returns doctor appointments', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/appointments/inbox')
        .set('Cookie', doctor.cookie);
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe(apptId);
    });

    it('GET /api/appointments/me?status=CANCELLED returns empty for no cancelled', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/appointments/me?status=CANCELLED')
        .set('Cookie', patient.cookie);
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(0);
    });

    it('GET /api/appointments/:id returns detail with logs', async () => {
      // Approve first so there are multiple logs
      await request(app.getHttpServer())
        .post(`/api/appointments/${apptId}/approve`)
        .set('Cookie', doctor.cookie);

      const res = await request(app.getHttpServer())
        .get(`/api/appointments/${apptId}`)
        .set('Cookie', patient.cookie);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(apptId);
      expect(res.body.logs).toHaveLength(2);
      expect(res.body.logs[0].newStatus).toBe('PENDING');
      expect(res.body.logs[1].newStatus).toBe('APPROVED');
    });

    it('GET /api/appointments/:id by non-participant → 403', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/appointments/${apptId}`)
        .set('Cookie', patient2.cookie);
      expect(res.status).toBe(403);
    });

    it('GET /api/appointments/:id for nonexistent → 404', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/appointments/${uuid()}`)
        .set('Cookie', patient.cookie);
      expect(res.status).toBe(404);
    });
  });
});
