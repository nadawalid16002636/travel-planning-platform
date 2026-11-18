
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import PDFDocument from 'pdfkit';
import { FxService } from '../fx/fx.service.js';
import { UsersService } from '../users/users.service.js';

import { Itinerary, ItineraryDocument } from './itinerary.schema.js';
import { CreateItineraryDto } from './dto/create-itinerary.dto.js';
import { UpdateItineraryDaysDto } from './dto/update-itinerary-days.dto.js';
import { Role, type JwtUser } from '../common/roles.js';
import { ReferenceService } from '../reference/reference.service.js';
import { UpdateItineraryDto } from './dto/update-itinerary.dto.js';
import { ConfirmItineraryDeletionDto } from './dto/confirm-itinerary-deletion.dto.js';
import { paginate } from '../common/pagination.dto.js';
import { ItinerariesPaginationQueryDto } from './dto/itineraries-pagination-query.dto.js';
import { CreateItineraryDayDto } from './dto/create-itinerary-day.dto.js';
import { UpdateItineraryDayDto } from './dto/update-itinerary-day.dto.js';
import { ConfirmDayDeletionDto } from './dto/confirm-day-deletion.dto.js';
import { MoveItineraryDayDto } from './dto/move-itinerary-day.dto.js';
import { CreateDayBudgetEntryDto } from './dto/create-day-budget-entry.dto.js';
import { UpdateDayBudgetEntryDto } from './dto/update-day-budget-entry.dto.js';
import { CreateIntercityTransportEntryDto } from './dto/create-intercity-transport-entry.dto.js';
import { UpdateIntercityTransportEntryDto } from './dto/update-intercity-transport-entry.dto.js';
import { CreateItineraryActivityDto } from './dto/create-itinerary-activity.dto.js';
import { UpdateItineraryActivityDto } from './dto/update-itinerary-activity.dto.js';
import { PublicItinerarySearchDto } from './dto/public-itinerary.dto.js';
import { ITINERARY_BUDGET_SUMMARY_CATEGORIES } from './dto/itinerary-budget-summary.dto.js';
import type {
  ItineraryBudgetSummaryCategory,
  RawItineraryBudgetSummaryDto,
  UnassignedLegacyBudgetEntryDto,
} from './dto/itinerary-budget-summary.dto.js';
import {
  BudgetConversionUnavailableReason,
  ItineraryBudgetConversionDto,
} from './dto/itinerary-budget-conversion.dto.js';
import { convertItineraryBudgetSummary } from './itinerary-budget-conversion.js';
import { HotelsService } from '../hotels/hotels.service.js';
import { HotelSearchDto } from '../hotels/dto/hotel-search.dto.js';
import { AirportsService } from '../p2/airports.service.js';
import { FlightsService } from '../p2/flights.service.js';
import { SearchFlightsDto } from '../p2/dto.js';
import { BookingsService } from '../p2/bookings.service.js';
import type { P2Principal } from '../p2/access.js';
import { UploadsService } from '../uploads/uploads.service.js';
import { AssociateFlightBookingDto } from './dto/itinerary-booking.dto.js';
import type { ItineraryLinkedBookingDto } from './dto/itinerary-booking.dto.js';
import {
  ItineraryFlightSearchDto,
  ItineraryHotelSearchDto,
} from './dto/itinerary-search-integrations.dto.js';

const escapeRegex = (value: string) =>
  new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

@Injectable()
export class ItinerariesService {
  constructor(
    @InjectModel(Itinerary.name)
    private readonly itineraryModel: Model<ItineraryDocument>,
    private readonly reference: ReferenceService,
    private readonly usersService: UsersService,
    private readonly fxService: FxService,
    private readonly hotels: HotelsService,
    private readonly airports: AirportsService,
    private readonly flights: FlightsService,
    private readonly flightBookings: BookingsService,
    private readonly uploads: UploadsService,
  ) {}

  async create(
    createItineraryDto: CreateItineraryDto,
    user: JwtUser,
  ) {
    const startDate = this.parseDateOnly(createItineraryDto.startDate);
    const countryCodes = await this.validateCountries(
      createItineraryDto.countryCodes,
    );

    const days = await this.prepareDays(
      createItineraryDto.days ?? [],
      startDate,
    );

    const itinerary = new this.itineraryModel({
      ...createItineraryDto,
      countryCodes,
      startDate,
      days,
      userId: new Types.ObjectId(user.sub),
    });

    const saved = await itinerary.save();
    return this.toResponse(saved);
  }

  async updateDays(
    id: string,
    updateDto: UpdateItineraryDaysDto,
    user: JwtUser,
  ) {
    const itinerary = await this.getOwnedItinerary(id, user);

    // The replacement contract identifies rows only by order. It cannot safely
    // determine which original day owns legacy free-text city data after a move.
    if ((itinerary.days ?? []).some((day: any) => day.city !== undefined && day.city !== null)) {
      throw new ConflictException(
        'Bulk day replacement is unavailable while legacy city data exists; use individual day operations',
      );
    }

    if ((itinerary.days ?? []).some((day: any) => (day.budgetEntries ?? []).length > 0)) {
      throw new ConflictException(
        'Bulk day replacement is unavailable while day-linked budget entries exist; use individual day operations',
      );
    }

    if ((itinerary.days ?? []).some((day: any) => (day.transportEntries ?? []).length > 0)) {
      throw new ConflictException(
        'Bulk day replacement is unavailable while intercity transport entries exist; use individual day operations',
      );
    }

    if ((itinerary.days ?? []).some((day: any) => (day.bookingAssociations ?? []).length > 0)) {
      throw new ConflictException(
        'Bulk day replacement is unavailable while booking associations exist; use individual day operations',
      );
    }

    const days = await this.prepareDays(
      updateDto.days,
      itinerary.startDate,
      true,
    );

    itinerary.days = days as any;

    const saved = await itinerary.save();
    return this.toResponse(saved);
  }

  async addDay(id: string, dto: CreateItineraryDayDto, user: JwtUser) {
    const itinerary = await this.getOwnedItinerary(id, user);
    const orderedDays = this.getOrderedDays(itinerary.days);
    if (orderedDays.length >= 60) {
      throw new BadRequestException('An itinerary cannot exceed 60 days');
    }
    if (typeof dto?.cityId !== 'string' || dto.cityId.trim() === '') {
      throw new BadRequestException('Each itinerary day requires a cityId');
    }

    await this.reference.city(dto.cityId);
    orderedDays.push({
      cityId: dto.cityId,
      ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      activities: [],
      images: [],
    });
    this.applyDaySequence(itinerary, orderedDays);

    const saved = await itinerary.save();
    return this.toResponse(saved);
  }

  async createActivity(
    id: string,
    dayOrder: number,
    dto: CreateItineraryActivityDto,
    user: JwtUser,
  ) {
    this.assertPositiveDayOrder(dayOrder);
    const itinerary = await this.getOwnedItinerary(id, user);
    const day = (itinerary.days ?? []).find((item: any) => item.order === dayOrder);
    if (!day) throw new NotFoundException('Itinerary day not found');

    const activity = await this.prepareActivity(dto);
    const activities: any[] = day.activities ?? (day.activities = []);
    activities.push({ _id: new Types.ObjectId(), ...activity, images: [] });

    const saved = await itinerary.save();
    return this.toResponse(saved);
  }

  async updateActivity(
    id: string,
    dayOrder: number,
    activityId: string,
    dto: UpdateItineraryActivityDto,
    user: JwtUser,
  ) {
    this.assertPositiveDayOrder(dayOrder);
    if (!dto || !Object.values(dto).some((value) => value !== undefined)) {
      throw new BadRequestException('At least one activity field must be supplied');
    }
    const parsedActivityId = this.parseSubdocumentId(activityId, 'activity');
    const itinerary = await this.getOwnedItinerary(id, user);
    const day = (itinerary.days ?? []).find((item: any) => item.order === dayOrder);
    if (!day) throw new NotFoundException('Itinerary day not found');
    const activities: any[] = day.activities ?? [];
    const index = activities.findIndex((item) => String(item._id) === parsedActivityId);
    if (index < 0) throw new NotFoundException('Itinerary activity not found');

    const target = activities[index];
    const update = dto.cost !== undefined
      ? { ...dto, cost: await this.prepareActivityCost(dto.cost) }
      : dto;
    for (const [key, value] of Object.entries(update)) {
      if (value !== undefined) target[key] = value;
    }

    const saved = await itinerary.save();
    return this.toResponse(saved);
  }

  async deleteActivity(
    id: string,
    dayOrder: number,
    activityId: string,
    user: JwtUser,
  ) {
    this.assertPositiveDayOrder(dayOrder);
    const parsedActivityId = this.parseSubdocumentId(activityId, 'activity');
    const itinerary = await this.getOwnedItinerary(id, user);
    const day = (itinerary.days ?? []).find((item: any) => item.order === dayOrder);
    if (!day) throw new NotFoundException('Itinerary day not found');
    const activities: any[] = day.activities ?? [];
    const index = activities.findIndex((item) => String(item._id) === parsedActivityId);
    if (index < 0) throw new NotFoundException('Itinerary activity not found');
    activities.splice(index, 1);

    const saved = await itinerary.save();
    return this.toResponse(saved);
  }

  /** ITN-12 / GEN-08: attach an uploaded image to an owned activity (max 5). */
  async addActivityImage(
    id: string,
    dayOrder: number,
    activityId: string,
    file: Express.Multer.File,
    user: JwtUser,
  ) {
    this.assertPositiveDayOrder(dayOrder);
    const parsedActivityId = this.parseSubdocumentId(activityId, 'activity');
    const itinerary = await this.getOwnedItinerary(id, user);
    const day = (itinerary.days ?? []).find((item: any) => item.order === dayOrder);
    if (!day) throw new NotFoundException('Itinerary day not found');
    const activities: any[] = day.activities ?? [];
    const activity = activities.find((item) => String(item._id) === parsedActivityId);
    if (!activity) throw new NotFoundException('Itinerary activity not found');
    const images: string[] = activity.images ?? (activity.images = []);
    if (images.length >= 5) throw new BadRequestException('This activity already has 5 images');

    const stored = await this.uploads.validateAndStore(file, {
      purpose: 'activity',
      entityId: parsedActivityId,
      user,
    });
    images.push(stored.url);
    const saved = await itinerary.save();
    return {
      id: stored.id,
      url: stored.url,
      itinerary: this.toResponse(saved),
    };
  }

  /** ITN-12: remove an owned activity image by upload id. */
  async removeActivityImage(
    id: string,
    dayOrder: number,
    activityId: string,
    imageId: string,
    user: JwtUser,
  ) {
    this.assertPositiveDayOrder(dayOrder);
    const parsedActivityId = this.parseSubdocumentId(activityId, 'activity');
    const itinerary = await this.getOwnedItinerary(id, user);
    const day = (itinerary.days ?? []).find((item: any) => item.order === dayOrder);
    if (!day) throw new NotFoundException('Itinerary day not found');
    const activities: any[] = day.activities ?? [];
    const activity = activities.find((item) => String(item._id) === parsedActivityId);
    if (!activity) throw new NotFoundException('Itinerary activity not found');

    const upload = await this.uploads.get(imageId);
    if (upload.purpose !== 'activity' || upload.entityId !== parsedActivityId) {
      throw new NotFoundException('Image not found on this activity');
    }
    const images: string[] = activity.images ?? [];
    const index = images.indexOf(upload.url);
    if (index < 0) throw new NotFoundException('Image not found on this activity');
    images.splice(index, 1);
    activity.images = images;
    const saved = await itinerary.save();
    await this.uploads.remove(imageId, user);
    return {
      deleted: true,
      id: imageId,
      itinerary: this.toResponse(saved),
    };
  }

  private async prepareActivity(dto: CreateItineraryActivityDto | UpdateItineraryActivityDto) {
    if (dto.title !== undefined && (typeof dto.title !== 'string' || dto.title.trim() === '')) {
      throw new BadRequestException('Activity title is required');
    }
    if (dto.cost === undefined) return { ...dto };
    return { ...dto, cost: await this.prepareActivityCost(dto.cost) };
  }

  private async prepareActivityCost(cost: CreateItineraryActivityDto['cost']) {
    if (!cost || typeof cost.amount !== 'number' || !Number.isFinite(cost.amount) || cost.amount < 0) {
      throw new BadRequestException('Activity cost amount must be a non-negative finite number');
    }
    if (typeof cost.currency !== 'string' || !/^[A-Za-z]{3}$/.test(cost.currency.trim())) {
      throw new BadRequestException('Activity cost currency must be a three-letter currency code');
    }
    const currency = cost.currency.trim().toUpperCase();
    if (!(await this.reference.isSupportedCurrency(currency))) {
      throw new BadRequestException(`Unsupported currency: ${currency}`);
    }
    return { amount: cost.amount, currency };
  }

  async createDayBudgetEntry(
    id: string,
    dayOrder: number,
    dto: CreateDayBudgetEntryDto,
    user: JwtUser,
  ) {
    this.assertPositiveDayOrder(dayOrder);
    const itinerary = await this.getOwnedItinerary(id, user);
    const day = (itinerary.days ?? []).find((item: any) => item.order === dayOrder);
    if (!day) throw new NotFoundException('Itinerary day not found');
    const currency = await this.validateBudgetEntryCurrency(dto.currency);
    day.budgetEntries ??= [];
    day.budgetEntries.push({ ...dto, currency } as any);
    return this.toResponse(await itinerary.save());
  }

  async updateDayBudgetEntry(
    id: string,
    dayOrder: number,
    entryId: string,
    dto: UpdateDayBudgetEntryDto,
    user: JwtUser,
  ) {
    this.assertPositiveDayOrder(dayOrder);
    if (!dto || !Object.values(dto).some((value) => value !== undefined)) {
      throw new BadRequestException('At least one budget entry field must be supplied');
    }
    const entryObjectId = this.parseSubdocumentId(entryId, 'budget entry');
    const itinerary = await this.getOwnedItinerary(id, user);
    const day = (itinerary.days ?? []).find((item: any) => item.order === dayOrder);
    if (!day) throw new NotFoundException('Itinerary day not found');
    const entries: any = day.budgetEntries ?? [];
    const entry = typeof entries.id === 'function'
      ? entries.id(entryObjectId)
      : entries.find((item: any) => String(item._id) === entryObjectId);
    if (!entry) throw new NotFoundException('Day budget entry not found');
    const normalizedCurrency = dto.currency !== undefined
      ? await this.validateBudgetEntryCurrency(dto.currency)
      : undefined;

    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) entry[key] = key === 'currency' ? normalizedCurrency : value;
    }
    return this.toResponse(await itinerary.save());
  }

  async deleteDayBudgetEntry(
    id: string,
    dayOrder: number,
    entryId: string,
    user: JwtUser,
  ) {
    this.assertPositiveDayOrder(dayOrder);
    const entryObjectId = this.parseSubdocumentId(entryId, 'budget entry');
    const itinerary = await this.getOwnedItinerary(id, user);
    const day = (itinerary.days ?? []).find((item: any) => item.order === dayOrder);
    if (!day) throw new NotFoundException('Itinerary day not found');
    const entries: any = day.budgetEntries ?? [];
    const entry = typeof entries.id === 'function'
      ? entries.id(entryObjectId)
      : entries.find((item: any) => String(item._id) === entryObjectId);
    if (!entry) throw new NotFoundException('Day budget entry not found');
    if (typeof entries.id === 'function') entry.deleteOne();
    else entries.splice(entries.indexOf(entry), 1);
    return this.toResponse(await itinerary.save());
  }

  async createDayTransportEntry(
    id: string,
    dayOrder: number,
    dto: CreateIntercityTransportEntryDto,
    user: JwtUser,
  ) {
    this.assertPositiveDayOrder(dayOrder);
    const itinerary = await this.getOwnedItinerary(id, user);
    const day = (itinerary.days ?? []).find((item: any) => item.order === dayOrder);
    if (!day) throw new NotFoundException('Itinerary day not found');

    const mode = typeof dto?.mode === 'string' ? dto.mode.trim() : '';
    const fromCityId = typeof dto?.fromCityId === 'string' ? dto.fromCityId.trim() : '';
    const toCityId = typeof dto?.toCityId === 'string' ? dto.toCityId.trim() : '';
    if (!mode) throw new BadRequestException('Transport mode must be nonblank');
    if (!fromCityId || !toCityId) {
      throw new BadRequestException('Both transport city IDs are required');
    }
    if (fromCityId === toCityId) {
      throw new BadRequestException('Transport origin and destination must differ');
    }
    this.assertNonnegativeTransportAmount(dto.amount);

    await Promise.all([
      this.reference.city(fromCityId),
      this.reference.city(toCityId),
    ]);
    const currency = await this.validateTransportCurrency(dto.currency);

    day.transportEntries ??= [];
    day.transportEntries.push({
      mode,
      fromCityId,
      toCityId,
      amount: dto.amount,
      currency,
    } as any);
    return this.toResponse(await itinerary.save());
  }

  async updateDayTransportEntry(
    id: string,
    dayOrder: number,
    entryId: string,
    dto: UpdateIntercityTransportEntryDto,
    user: JwtUser,
  ) {
    this.assertPositiveDayOrder(dayOrder);
    if (!dto || !Object.values(dto).some((value) => value !== undefined)) {
      throw new BadRequestException('At least one transport entry field must be supplied');
    }
    const entryObjectId = this.parseSubdocumentId(entryId, 'transport entry');
    const itinerary = await this.getOwnedItinerary(id, user);
    const day = (itinerary.days ?? []).find((item: any) => item.order === dayOrder);
    if (!day) throw new NotFoundException('Itinerary day not found');
    const entries: any = day.transportEntries ?? [];
    const entry = typeof entries.id === 'function'
      ? entries.id(entryObjectId)
      : entries.find((item: any) => String(item._id) === entryObjectId);
    if (!entry) throw new NotFoundException('Intercity transport entry not found');

    const existing = typeof entry.toObject === 'function' ? entry.toObject() : { ...entry };
    const merged = { ...existing, ...dto };
    const mode = typeof merged.mode === 'string' ? merged.mode.trim() : '';
    const fromCityId = typeof merged.fromCityId === 'string' ? merged.fromCityId.trim() : '';
    const toCityId = typeof merged.toCityId === 'string' ? merged.toCityId.trim() : '';
    if (!mode) throw new BadRequestException('Transport mode must be nonblank');
    if (!fromCityId || !toCityId) {
      throw new BadRequestException('Both transport city IDs are required');
    }
    if (fromCityId === toCityId) {
      throw new BadRequestException('Transport origin and destination must differ');
    }
    this.assertNonnegativeTransportAmount(merged.amount);

    // Validate the final pair, not only the fields present in this PATCH. This
    // catches one-sided changes that would make origin equal destination.
    await Promise.all([
      this.reference.city(fromCityId),
      this.reference.city(toCityId),
    ]);
    const currency = await this.validateTransportCurrency(merged.currency);

    if (dto.mode !== undefined) entry.mode = mode;
    if (dto.fromCityId !== undefined) entry.fromCityId = fromCityId;
    if (dto.toCityId !== undefined) entry.toCityId = toCityId;
    if (dto.amount !== undefined) entry.amount = merged.amount;
    if (dto.currency !== undefined) entry.currency = currency;
    return this.toResponse(await itinerary.save());
  }

  async deleteDayTransportEntry(
    id: string,
    dayOrder: number,
    entryId: string,
    user: JwtUser,
  ) {
    this.assertPositiveDayOrder(dayOrder);
    const entryObjectId = this.parseSubdocumentId(entryId, 'transport entry');
    const itinerary = await this.getOwnedItinerary(id, user);
    const day = (itinerary.days ?? []).find((item: any) => item.order === dayOrder);
    if (!day) throw new NotFoundException('Itinerary day not found');
    const entries: any = day.transportEntries ?? [];
    const entry = typeof entries.id === 'function'
      ? entries.id(entryObjectId)
      : entries.find((item: any) => String(item._id) === entryObjectId);
    if (!entry) throw new NotFoundException('Intercity transport entry not found');
    if (typeof entries.id === 'function') entry.deleteOne();
    else entries.splice(entries.indexOf(entry), 1);
    return this.toResponse(await itinerary.save());
  }

  private assertNonnegativeTransportAmount(amount: unknown) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException('Transport amount must be a nonnegative number');
    }
  }

  private async validateTransportCurrency(currency: unknown) {
    if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency.trim().toUpperCase())) {
      throw new BadRequestException('Transport currency must be a three-letter code');
    }
    const normalized = currency.trim().toUpperCase();
    if (!(await this.reference.isSupportedCurrency(normalized))) {
      throw new BadRequestException(`Unsupported currency: ${normalized}`);
    }
    return normalized;
  }

  private async validateBudgetEntryCurrency(currency: string) {
    const normalized = currency.trim().toUpperCase();
    if (!(await this.reference.isSupportedCurrency(normalized))) {
      throw new BadRequestException(`Unsupported currency: ${normalized}`);
    }
    return normalized;
  }

  private parseSubdocumentId(id: string, label: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid ${label} ID`);
    }
    return new Types.ObjectId(id).toString();
  }

  async updateDay(
    id: string,
    dayOrder: number,
    dto: UpdateItineraryDayDto,
    user: JwtUser,
  ) {
    this.assertPositiveDayOrder(dayOrder);
    if (!dto || !Object.values(dto).some((value) => value !== undefined)) {
      throw new BadRequestException('At least one day field must be supplied');
    }
    const itinerary = await this.getOwnedItinerary(id, user);
    const day = (itinerary.days ?? []).find((item: any) => item.order === dayOrder);
    if (!day) throw new NotFoundException('Itinerary day not found');

    if (dto.cityId !== undefined) {
      await this.reference.city(dto.cityId);
      day.cityId = dto.cityId;
    }
    if (dto.notes !== undefined) day.notes = dto.notes;

    const saved = await itinerary.save();
    return this.toResponse(saved);
  }

  async deleteDay(
    id: string,
    dayOrder: number,
    confirmation: ConfirmDayDeletionDto,
    user: JwtUser,
  ) {
    this.assertPositiveDayOrder(dayOrder);
    if (confirmation?.confirmed !== true) {
      throw new BadRequestException('Day deletion must be confirmed');
    }
    const itinerary = await this.getOwnedItinerary(id, user);
    const orderedDays = this.getOrderedDays(itinerary.days);
    const index = orderedDays.findIndex((day: any) => day.order === dayOrder);
    if (index < 0) throw new NotFoundException('Itinerary day not found');

    // Remove only the selected original subdocument. Top-level budget entries
    // are intentionally left untouched because they have no day association.
    orderedDays.splice(index, 1);
    this.applyDaySequence(itinerary, orderedDays);

    const saved = await itinerary.save();
    return this.toResponse(saved);
  }

  async moveDay(
    id: string,
    dayOrder: number,
    dto: MoveItineraryDayDto,
    user: JwtUser,
  ) {
    this.assertPositiveDayOrder(dayOrder);
    this.assertPositiveDayOrder(dto?.newDayOrder);
    const itinerary = await this.getOwnedItinerary(id, user);
    const orderedDays = this.getOrderedDays(itinerary.days);
    const sourceIndex = orderedDays.findIndex((day: any) => day.order === dayOrder);
    if (sourceIndex < 0) throw new NotFoundException('Itinerary day not found');
    if (dto.newDayOrder > orderedDays.length) {
      throw new BadRequestException('newDayOrder must be within the itinerary day range');
    }

    // Splice the original subdocument reference so nested fields and legacy city
    // text travel with that day instead of being copied by the target position.
    const [day] = orderedDays.splice(sourceIndex, 1);
    orderedDays.splice(dto.newDayOrder - 1, 0, day);
    this.applyDaySequence(itinerary, orderedDays);

    const saved = await itinerary.save();
    return this.toResponse(saved);
  }

  async updateItinerary(
    id: string,
    updateDto: UpdateItineraryDto,
    user: JwtUser,
  ) {
    const itinerary = await this.getOwnedItinerary(id, user);
    if (!Object.values(updateDto).some((value) => value !== undefined)) {
      throw new BadRequestException('At least one itinerary field must be supplied');
    }

    if (updateDto.title !== undefined) itinerary.title = updateDto.title;
    if (updateDto.description !== undefined) itinerary.description = updateDto.description;
    if (updateDto.visibility !== undefined) itinerary.visibility = updateDto.visibility;
    if (updateDto.countryCodes !== undefined) {
      itinerary.countryCodes = await this.validateCountries(updateDto.countryCodes);
    }
    if (updateDto.startDate !== undefined) {
      const startDate = this.parseDateOnly(updateDto.startDate);
      itinerary.startDate = startDate;
      itinerary.days = this.recalculateExistingDayDates(itinerary.days, startDate) as any;
    }

    const saved = await itinerary.save();
    return this.toResponse(saved);
  }

  async deleteItinerary(
    id: string,
    confirmation: ConfirmItineraryDeletionDto,
    user: JwtUser,
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid itinerary ID');
    }
    if (confirmation.confirmed !== true) {
      throw new BadRequestException('Itinerary deletion must be confirmed');
    }

    const result = await this.itineraryModel
      .deleteOne({ _id: new Types.ObjectId(id), userId: new Types.ObjectId(user.sub) })
      .exec();
    if (result.deletedCount !== 1) {
      throw new NotFoundException('Itinerary not found');
    }
    return { deleted: true, id };
  }

  private async prepareDays(
    days: any[],
    startDate: Date,
    sortByRequestedOrder = false,
  ) {
    if (days.length > 60) {
      throw new BadRequestException('An itinerary cannot exceed 60 days');
    }

    const orderedDays = sortByRequestedOrder
      ? [...days].sort((left, right) => left.order - right.order)
      : days;
    const scheduleStart = new Date(
      Date.UTC(
        startDate.getUTCFullYear(),
        startDate.getUTCMonth(),
        startDate.getUTCDate(),
      ),
    );

    if (
      sortByRequestedOrder &&
      (new Set(days.map((day) => day.order)).size !== days.length ||
        !days.every((day) => Number.isInteger(day.order) && day.order > 0))
    ) {
      throw new BadRequestException('Day orders must be unique positive integers');
    }

    return Promise.all(
      orderedDays.map(async (day, index) => {
        const cityId = day.cityId;
        if (typeof cityId !== 'string' || cityId.trim() === '') {
          throw new BadRequestException('Each itinerary day requires a cityId');
        }
        await this.reference.city(cityId);

        for (const activity of day.activities ?? []) {
          if (activity.cost) {
            const currency = activity.cost.currency.toUpperCase();
            if (!(await this.reference.isSupportedCurrency(currency))) {
              throw new BadRequestException(`Unsupported currency: ${currency}`);
            }
            activity.cost.currency = currency;
          }
        }

        const date = new Date(scheduleStart);
        date.setUTCDate(date.getUTCDate() + index);
        const { order: _requestedOrder, ...dayFields } = day;
        return {
          ...dayFields,
          cityId,
          order: index + 1,
          date,
          activities: day.activities ?? [],
        };
      }),
    );
  }

  private async validateCountries(countryCodes: string[]) {
    if (!Array.isArray(countryCodes) || countryCodes.length < 1) {
      throw new BadRequestException('At least one country is required');
    }
    const normalized = countryCodes.map((code) => code.toUpperCase());
    await Promise.all(normalized.map((code) => this.reference.country(code)));
    return normalized;
  }

  private parseDateOnly(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException('startDate must use YYYY-MM-DD format');
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException('startDate is not a valid calendar date');
    }
    return date;
  }

  private async getOwnedItinerary(id: string, user: JwtUser) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid itinerary ID');
    }

    const itinerary = await this.itineraryModel.findById(id).exec();

    if (!itinerary) {
      throw new NotFoundException('Itinerary not found');
    }

    if (String(itinerary.userId) !== user.sub) {
      throw new ForbiddenException(
        'You do not own this itinerary',
      );
    }

    return itinerary;
  }

  async findAll(user: JwtUser, query: ItinerariesPaginationQueryDto) {
    const filter = { userId: new Types.ObjectId(user.sub) };
    const [itineraries, total] = await Promise.all([
      this.itineraryModel
        .find(filter)
        .sort({ updatedAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .exec(),
      this.itineraryModel.countDocuments(filter).exec(),
    ]);
    return paginate(
      itineraries.map((itinerary) => this.toResponse(itinerary)),
      total,
      query,
    );
  }

  /** Public-safe itinerary cards for BLG-12 author pages. */
  async findPublicByAuthor(authorId: string, page = 1, limit = 10) {
    if (!Types.ObjectId.isValid(authorId)) throw new BadRequestException('Invalid author ID');
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('Invalid public itinerary pagination');
    }
    const filter = { userId: new Types.ObjectId(authorId), visibility: 'public' };
    const [documents, total] = await Promise.all([
      this.itineraryModel
        .find(filter)
        .select('_id title countryCodes startDate days.order days.cityId updatedAt')
        .sort({ updatedAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.itineraryModel.countDocuments(filter).exec(),
    ]);
    return {
      data: documents.map((itinerary: any) => ({
        id: String(itinerary._id),
        title: itinerary.title,
        countryCodes: itinerary.countryCodes ?? null,
        startDate: itinerary.startDate,
        durationDays: itinerary.days?.length ?? 0,
        cityIds: [...new Set((itinerary.days ?? []).map((day: any) => day.cityId).filter((cityId: unknown): cityId is string => typeof cityId === 'string'))],
        updatedAt: itinerary.updatedAt,
      })),
      page,
      limit,
      total,
    };
  }

  async searchHotelsForCityGroup(
    id: string,
    startDayOrder: number,
    query: ItineraryHotelSearchDto,
    user: JwtUser,
  ) {
    this.assertPositiveDayOrder(startDayOrder);
    const itinerary = await this.getOwnedItinerary(id, user);
    const groups = this.getItineraryCityGroups(itinerary);
    const group = groups.find((item) => item.startDayOrder === startDayOrder);
    if (!group) throw new NotFoundException('Itinerary city group not found');

    const city = await this.reference.city(group.cityId);
    if (!city.countryCode) throw new BadRequestException('City has no country mapping for hotel search');
    const country = await this.reference.country(city.countryCode);
    const hotelQuery: HotelSearchDto = Object.assign(new HotelSearchDto(), {
      city: city.name,
      country: country.name,
      checkIn: group.checkIn,
      checkOut: group.checkOut,
      guests: query.guests,
      rooms: query.rooms,
      amenity: query.amenity,
      minRating: query.minRating,
      page: query.page,
      limit: query.limit,
    });
    const hotels = await this.hotels.search(hotelQuery);
    return {
      itineraryId: String(itinerary._id),
      cityGroup: {
        cityId: group.cityId,
        startDayOrder: group.startDayOrder,
        endDayOrder: group.endDayOrder,
        dayCount: group.dayCount,
        checkIn: group.checkIn,
        checkOut: group.checkOut,
      },
      location: { cityId: String(city._id), city: city.name, countryCode: city.countryCode, country: country.name },
      hotels,
    };
  }

  async searchFlightsForItinerary(
    id: string,
    query: ItineraryFlightSearchDto,
    user: JwtUser,
  ) {
    const itinerary = await this.getOwnedItinerary(id, user);
    const days = this.getValidatedItinerarySchedule(itinerary);
    if (!days.length) throw new BadRequestException('Itinerary has no travel days');
    const firstDay = days[0];
    if (typeof firstDay.day.cityId !== 'string' || firstDay.day.cityId.trim() === '') {
      throw new BadRequestException('The first itinerary day has no canonical city for flight search');
    }
    const city = await this.reference.city(firstDay.day.cityId);
    const origin = await this.airports.byCode(query.departureAirport);
    const mappedAirports = await this.findAirportsForCity(firstDay.day.cityId);
    if (!mappedAirports.length) {
      throw new BadRequestException('No airport mapping exists for the first itinerary day city');
    }

    let destinations = mappedAirports;
    if (query.arrivalAirport !== undefined) {
      destinations = mappedAirports.filter((airport) => airport.code === query.arrivalAirport);
      if (!destinations.length) {
        throw new BadRequestException('arrivalAirport is not mapped to the itinerary first day city');
      }
    }
    destinations = destinations.filter((airport) => airport.code !== origin.code);
    if (!destinations.length) {
      throw new BadRequestException('Origin and destination airports must differ');
    }

    const departureDate = query.departureDate ?? days[0].date;
    this.parseDateOnly(departureDate);
    if (query.tripType === 'one-way' && query.returnDate !== undefined) {
      throw new BadRequestException('returnDate is only valid for round-trip searches');
    }
    const returnDate = query.tripType === 'round-trip'
      ? query.returnDate ?? days[days.length - 1].date
      : undefined;
    if (returnDate !== undefined) {
      this.parseDateOnly(returnDate);
      if (returnDate < departureDate) {
        throw new BadRequestException('returnDate must be on or after departureDate');
      }
    }

    const options = await Promise.all(destinations.map(async (destination) => {
      const flightQuery = Object.assign(new SearchFlightsDto(), query, {
        departureAirport: origin.code,
        arrivalAirport: destination.code,
        departureDate,
        tripType: query.tripType,
        ...(returnDate !== undefined ? { returnDate } : {}),
      });
      return {
        arrivalAirport: destination,
        results: await this.flights.search(flightQuery),
      };
    }));

    return {
      itineraryId: String(itinerary._id),
      originAirport: origin,
      destinationCity: { cityId: String(city._id), name: city.name, countryCode: city.countryCode },
      departureDate,
      tripType: query.tripType,
      ...(returnDate !== undefined ? { returnDate } : {}),
      options,
    };
  }

  private getValidatedItinerarySchedule(itinerary: ItineraryDocument) {
    const days = this.getOrderedDays(itinerary.days);
    const startDate = this.tryDateOnlyUtc(itinerary.startDate);
    if (!startDate) throw new BadRequestException('Itinerary startDate is invalid');
    const expectedDate = new Date(`${startDate}T00:00:00.000Z`);
    return days.map((day: any, index) => {
      const date = this.tryDateOnlyUtc(day.date);
      if (!date || date !== expectedDate.toISOString().slice(0, 10)) {
        throw new BadRequestException('Stored itinerary day dates are inconsistent with startDate and day order');
      }
      const result = { day, date };
      expectedDate.setUTCDate(expectedDate.getUTCDate() + 1);
      return result;
    });
  }

  private getItineraryCityGroups(itinerary: ItineraryDocument) {
    const days = this.getValidatedItinerarySchedule(itinerary);
    if (!days.length) throw new BadRequestException('Itinerary has no travel days');
    const groups: Array<{
      cityId: string;
      startDayOrder: number;
      endDayOrder: number;
      dayCount: number;
      checkIn: string;
      checkOut: string;
    }> = [];
    for (const { day, date } of days) {
      if (typeof day.cityId !== 'string' || day.cityId.trim() === '') {
        throw new BadRequestException('A day has no canonical city for hotel search');
      }
      const previous = groups[groups.length - 1];
      if (previous?.cityId === day.cityId && previous.endDayOrder + 1 === day.order) {
        previous.endDayOrder = day.order;
        previous.dayCount += 1;
        const checkout = new Date(`${date}T00:00:00.000Z`);
        checkout.setUTCDate(checkout.getUTCDate() + 1);
        previous.checkOut = checkout.toISOString().slice(0, 10);
      } else {
        const checkout = new Date(`${date}T00:00:00.000Z`);
        checkout.setUTCDate(checkout.getUTCDate() + 1);
        groups.push({
          cityId: day.cityId,
          startDayOrder: day.order,
          endDayOrder: day.order,
          dayCount: 1,
          checkIn: date,
          checkOut: checkout.toISOString().slice(0, 10),
        });
      }
    }
    return groups;
  }

  private async findAirportsForCity(cityId: string) {
    const airports: any[] = [];
    const limit = 100;
    let page = 1;
    let total = Number.POSITIVE_INFINITY;
    while ((page - 1) * limit < total) {
      const result = await this.airports.find({ city: cityId, page, limit } as any);
      const data = result.data ?? result.items ?? [];
      total = result.total ?? data.length;
      airports.push(...data);
      page += 1;
    }
    return airports;
  }

  async searchPublic(query: PublicItinerarySearchDto) {
    if (query.minDays !== undefined && query.maxDays !== undefined && query.minDays > query.maxDays) {
      throw new BadRequestException('minDays cannot exceed maxDays');
    }

    const clauses: Record<string, unknown>[] = [];
    if (query.country !== undefined) {
      const countryCode = query.country.toUpperCase();
      await this.reference.country(countryCode);
      clauses.push({ countryCodes: countryCode });
    }
    if (query.city !== undefined) {
      await this.reference.city(query.city);
      clauses.push({ 'days.cityId': query.city });
    }
    if (query.keyword?.trim()) {
      const keyword = query.keyword.trim();
      const [countryCodes, cityIds] = await Promise.all([
        this.findReferenceIdsByName(keyword, 'country'),
        this.findReferenceIdsByName(keyword, 'city'),
      ]);
      const pattern = escapeRegex(keyword);
      const alternatives: Record<string, unknown>[] = [
        { title: pattern },
        { destinations: pattern },
        { 'days.city': pattern },
      ];
      if (countryCodes.length) alternatives.push({ countryCodes: { $in: countryCodes } });
      if (cityIds.length) alternatives.push({ 'days.cityId': { $in: cityIds } });
      clauses.push({ $or: alternatives });
    }
    if (query.minDays !== undefined || query.maxDays !== undefined) {
      const dayCount = { $size: { $ifNull: ['$days', []] } };
      const comparisons: unknown[] = [];
      if (query.minDays !== undefined) comparisons.push({ $gte: [dayCount, query.minDays] });
      if (query.maxDays !== undefined) comparisons.push({ $lte: [dayCount, query.maxDays] });
      clauses.push({ $expr: comparisons.length === 1 ? comparisons[0] : { $and: comparisons } });
    }

    const filter: Record<string, unknown> = { visibility: 'public' };
    if (clauses.length) filter.$and = clauses;
    const [documents, total] = await Promise.all([
      this.itineraryModel
        .find(filter as any)
        .select('_id title description countryCodes startDate days.order days.cityId updatedAt')
        .sort({ updatedAt: -1, _id: 1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean()
        .exec(),
      this.itineraryModel.countDocuments(filter as any).exec(),
    ]);

    return {
      data: documents.map((document: any) => ({
        id: String(document._id),
        title: document.title,
        ...(document.description !== undefined ? { description: document.description } : {}),
        countryCodes: document.countryCodes ?? [],
        startDate: document.startDate,
        durationDays: document.days?.length ?? 0,
        cityIds: [...new Set((document.days ?? []).map((day: any) => day.cityId).filter((id: unknown): id is string => typeof id === 'string'))],
        ...(document.updatedAt !== undefined ? { updatedAt: document.updatedAt } : {}),
      })),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async getPublicDetails(id: string) {
    const itinerary = await this.findPublicItinerary(id);
    const author = await this.usersService.findById(String(itinerary.userId));
    const name = `${author.firstName ?? ''} ${author.lastName ?? ''}`.trim();
    const response = this.toResponse(itinerary);
    const cityCache = new Map<string, any>();
    const lookupCity = async (cityId: unknown) => {
      if (typeof cityId !== 'string' || cityId.length === 0) return null;
      if (!cityCache.has(cityId)) {
        try {
          const city = await this.reference.city(cityId);
          cityCache.set(cityId, { id: String(city._id), name: city.name, countryCode: city.countryCode });
        } catch (error) {
          if (!(error instanceof NotFoundException)) throw error;
          cityCache.set(cityId, null);
        }
      }
      return cityCache.get(cityId);
    };

    const days = await Promise.all((response.days ?? []).map(async (day: any) => ({
      order: day.order,
      date: day.date,
      cityId: day.cityId,
      ...(day.notes !== undefined ? { notes: day.notes } : {}),
      images: day.images ?? [],
      cityInfo: await lookupCity(day.cityId),
      ...(day.legacyData?.city !== undefined ? { legacyData: { city: day.legacyData.city } } : {}),
      activities: (day.activities ?? []).map((activity: any) => ({
        _id: String(activity._id),
        title: activity.title,
        ...(activity.description !== undefined ? { description: activity.description } : {}),
        ...(activity.location !== undefined ? { location: activity.location } : {}),
        ...(activity.startTime !== undefined ? { startTime: activity.startTime } : {}),
        ...(activity.endTime !== undefined ? { endTime: activity.endTime } : {}),
        ...(activity.cost !== undefined ? { cost: activity.cost } : {}),
        images: activity.images ?? [],
      })),
      budgetEntries: (day.budgetEntries ?? []).map((entry: any) => ({
        _id: String(entry._id),
        category: entry.category,
        amount: entry.amount,
        currency: entry.currency,
        ...(entry.description !== undefined ? { description: entry.description } : {}),
      })),
      transportEntries: await Promise.all((day.transportEntries ?? []).map(async (entry: any) => ({
        _id: String(entry._id),
        mode: entry.mode,
        fromCityId: entry.fromCityId,
        toCityId: entry.toCityId,
        amount: entry.amount,
        currency: entry.currency,
        fromCityInfo: await lookupCity(entry.fromCityId),
        toCityInfo: await lookupCity(entry.toCityId),
      }))),
    })));

    return {
      id: String(itinerary._id),
      title: response.title,
      ...(response.description !== undefined ? { description: response.description } : {}),
      countryCodes: response.countryCodes,
      startDate: response.startDate,
      author: { id: String(author._id), name },
      days,
      budgetEntries: (response.budgetEntries ?? []).map((entry: any) => ({
        category: entry.category,
        amount: entry.amount,
        currency: entry.currency,
        ...(entry.description !== undefined ? { description: entry.description } : {}),
        ...(entry.date !== undefined ? { date: entry.date } : {}),
      })),
      budgetSummary: this.calculateBudgetSummary(itinerary),
      ...(response.legacyData !== undefined ? { legacyData: response.legacyData } : {}),
    };
  }

  async findPublicSummaryById(id: string) {
    if (!Types.ObjectId.isValid(id)) return null;
    const itinerary: any = await this.itineraryModel
      .findOne({ _id: new Types.ObjectId(id), visibility: 'public' })
      .select('_id title countryCodes startDate days.order days.cityId updatedAt')
      .lean()
      .exec();
    if (!itinerary) return null;
    return {
      id: String(itinerary._id),
      title: itinerary.title,
      countryCodes: itinerary.countryCodes ?? null,
      startDate: this.tryDateOnlyUtc(itinerary.startDate),
      durationDays: itinerary.days?.length ?? 0,
      cityIds: [...new Set((itinerary.days ?? []).map((day: any) => day.cityId).filter((value: unknown): value is string => typeof value === 'string'))],
      updatedAt: itinerary.updatedAt,
    };
  }

  async clonePublicItinerary(id: string, user: JwtUser) {
    const source = await this.findPublicItinerary(id);
    const author = await this.usersService.findById(String(source.userId));
    const authorName = `${author.firstName ?? ''} ${author.lastName ?? ''}`.trim();
    const sourceObject = typeof (source as any).toObject === 'function'
      ? (source as any).toObject({ depopulate: true })
      : { ...(source as any) };
    const withoutId = (value: any) => {
      const plain = typeof value?.toObject === 'function' ? value.toObject() : { ...value };
      delete plain._id;
      delete plain.id;
      return plain;
    };
    const days = (sourceObject.days ?? []).map((day: any) => {
      const copy = withoutId(day);
      copy.activities = (day.activities ?? []).map(withoutId);
      copy.budgetEntries = (day.budgetEntries ?? []).map(withoutId);
      copy.transportEntries = (day.transportEntries ?? []).map(withoutId);
      // A clone must not inherit the source owner's independently owned bookings.
      delete copy.bookingAssociations;
      return copy;
    });
    const budgetEntries = (sourceObject.budgetEntries ?? []).map(withoutId);

    const clone = new this.itineraryModel({
      title: sourceObject.title,
      description: sourceObject.description,
      countryCodes: sourceObject.countryCodes,
      destinations: sourceObject.destinations,
      startDate: sourceObject.startDate,
      visibility: 'private',
      status: 'draft',
      days,
      budgetEntries,
      userId: new Types.ObjectId(user.sub),
      clonedFromItineraryId: source._id,
      clonedFromAuthorId: source.userId,
      clonedFromAuthorName: authorName,
    });
    return this.toResponse(await clone.save());
  }

  private async findReferenceIdsByName(keyword: string, kind: 'country' | 'city') {
    const ids: string[] = [];
    const limit = 100;
    let page = 1;
    let total = Number.POSITIVE_INFINITY;
    while ((page - 1) * limit < total) {
      const result = kind === 'country'
        ? await this.reference.countries({ search: keyword, page, limit } as any)
        : await this.reference.cities({ search: keyword, page, limit } as any);
      total = result.total;
      ids.push(...result.data.map((item: any) => String(item._id)));
      page += 1;
    }
    return ids;
  }

  private async findPublicItinerary(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid itinerary ID');
    const itinerary = await this.itineraryModel
      .findOne({ _id: new Types.ObjectId(id), visibility: 'public' })
      .exec();
    if (!itinerary) throw new NotFoundException('Public itinerary not found');
    return itinerary;
  }

  async findOne(id: string, user: JwtUser) {
    const itinerary = await this.getOwnedItinerary(id, user);
    const response = this.toResponse(itinerary);
    const linked = await this.loadLinkedFlightBookings(itinerary, user);
    response.days = response.days.map((day: any) => ({
      ...day,
      bookingAssociations: linked.get(day.order) ?? day.bookingAssociations ?? [],
    }));
    return response;
  }

  async associateFlightBooking(
    id: string,
    dayOrder: number,
    dto: AssociateFlightBookingDto,
    user: JwtUser,
  ) {
    const itinerary = await this.getOwnedItinerary(id, user);
    this.assertPositiveDayOrder(dayOrder);
    const days = this.getOrderedDays(itinerary.days);
    const day = days.find((item: any) => item.order === dayOrder);
    if (!day) throw new NotFoundException('Itinerary day not found');
    const bookingId = this.parseObjectId(dto?.bookingId, 'booking');
    const principal = this.bookingPrincipal(user);
    const booking = await this.flightBookings.get(String(bookingId), principal);
    if (booking.status !== 'confirmed') {
      throw new ConflictException('Only confirmed flight bookings can be associated');
    }
    const dayDate = this.tryDateOnlyUtc(day.date);
    if (!dayDate || !(booking.legs ?? []).some((leg: any) => this.flightLocalDate(leg) === dayDate)) {
      throw new BadRequestException('The selected itinerary day must match a booked flight departure date');
    }
    if (days.some((existing: any) => (existing.bookingAssociations ?? []).some(
      (association: any) => String(association.bookingId) === String(bookingId),
    ))) {
      throw new ConflictException('This flight booking is already associated with the itinerary');
    }
    day.bookingAssociations ??= [];
    day.bookingAssociations.push({ type: 'flight', bookingId });
    const saved = await itinerary.save();
    const response = this.toResponse(saved);
    const linked = await this.loadLinkedFlightBookings(saved, user);
    response.days = response.days.map((item: any) => ({
      ...item,
      bookingAssociations: linked.get(item.order) ?? item.bookingAssociations ?? [],
    }));
    return response;
  }

  async removeFlightBookingAssociation(
    id: string,
    dayOrder: number,
    bookingId: string,
    user: JwtUser,
  ) {
    const itinerary = await this.getOwnedItinerary(id, user);
    this.assertPositiveDayOrder(dayOrder);
    const parsedBookingId = this.parseObjectId(bookingId, 'booking');
    const day = this.getOrderedDays(itinerary.days).find((item: any) => item.order === dayOrder);
    if (!day) throw new NotFoundException('Itinerary day not found');
    const associations: any[] = day.bookingAssociations ?? [];
    const index = associations.findIndex((item) => String(item.bookingId) === String(parsedBookingId));
    if (index < 0) throw new NotFoundException('Booking association not found');
    associations.splice(index, 1);
    const saved = await itinerary.save();
    const response = this.toResponse(saved);
    const linked = await this.loadLinkedFlightBookings(saved, user);
    response.days = response.days.map((item: any) => ({
      ...item,
      bookingAssociations: linked.get(item.order) ?? item.bookingAssociations ?? [],
    }));
    return response;
  }

  async exportPdf(id: string, user: JwtUser): Promise<Buffer> {
    const itinerary = await this.getOwnedItinerary(id, user);
    const linked = await this.loadLinkedFlightBookings(itinerary, user);
    const summary = this.calculateBudgetSummary(itinerary, linked);
    const data = typeof (itinerary as any).toObject === 'function'
      ? (itinerary as any).toObject()
      : itinerary as any;
    const days = this.getOrderedDays(data.days ?? []);
    const document = new PDFDocument({ size: 'A4', margins: { top: 48, bottom: 54, left: 52, right: 52 }, bufferPages: true });
    const chunks: Buffer[] = [];
    const finished = new Promise<Buffer>((resolve, reject) => {
      document.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
    });
    const ensureSpace = (height = 54) => {
      if (document.y + height > document.page.height - document.page.margins.bottom) document.addPage();
    };
    const money = (values: Array<{ currency: string; amount: number }>) =>
      values.length ? values.map((value) => `${value.amount} ${value.currency}`).join('  ·  ') : '—';
    document.font('Helvetica-Bold').fontSize(22).fillColor('#17324d').text(data.title ?? 'Travel itinerary');
    document.moveDown(0.35).font('Helvetica').fontSize(10).fillColor('#536273')
      .text(`Start: ${this.tryDateOnlyUtc(data.startDate) ?? 'Unknown'}    Days: ${days.length}`);
    if (data.description) document.moveDown(0.6).fontSize(11).fillColor('#202a34').text(data.description);
    document.moveDown(1).font('Helvetica-Bold').fontSize(15).fillColor('#17324d').text('City groups');
    for (const group of summary.cityGroups) {
      ensureSpace(34);
      document.font('Helvetica').fontSize(10).fillColor('#202a34').text(
        `${group.cityId ?? 'Unmapped city'} · days ${group.startDayOrder}–${group.endDayOrder} (${group.dayCount}) · ${money(group.totalsByCurrency)}`,
      );
    }
    document.moveDown(0.8).font('Helvetica-Bold').fontSize(15).fillColor('#17324d').text('Days');
    for (const day of days) {
      ensureSpace(100);
      const date = this.tryDateOnlyUtc(day.date) ?? 'Unknown date';
      document.moveDown(0.45).font('Helvetica-Bold').fontSize(12).fillColor('#17324d')
        .text(`Day ${day.order} · ${date} · ${day.cityId ?? 'Unmapped city'}`);
      if (day.notes) { ensureSpace(22); document.font('Helvetica').fontSize(9).fillColor('#536273').text(day.notes); }
      for (const activity of day.activities ?? []) {
        ensureSpace(30);
        const cost = activity.cost ? ` · ${activity.cost.amount} ${activity.cost.currency}` : '';
        document.font('Helvetica').fontSize(10).fillColor('#202a34').text(`Activity: ${activity.name ?? activity.title ?? 'Activity'}${cost}`);
      }
      for (const transport of day.transportEntries ?? []) {
        ensureSpace(30);
        document.font('Helvetica').fontSize(10).fillColor('#202a34').text(
          `Transport: ${transport.mode} · ${transport.fromCityId} → ${transport.toCityId} · ${transport.amount} ${transport.currency}`,
        );
      }
      for (const booking of linked.get(day.order) ?? []) {
        ensureSpace(30);
        document.font('Helvetica').fontSize(10).fillColor('#202a34').text(
          `Flight booking ${booking.bookingId} · ${booking.includedInBudget ? `${booking.amount} ${booking.currency}` : booking.status}`,
        );
      }
      const totals = summary.dayTotals.find((total) => total.dayOrder === day.order);
      ensureSpace(24);
      document.font('Helvetica-Bold').fontSize(9).fillColor('#536273').text(`Day budget: ${money(totals?.totalsByCurrency ?? [])}`);
    }
    ensureSpace(80);
    document.moveDown(0.9).font('Helvetica-Bold').fontSize(15).fillColor('#17324d').text('Budget summary');
    document.moveDown(0.35).font('Helvetica-Bold').fontSize(10).fillColor('#202a34').text(`Total: ${money(summary.totalsByCurrency)}`);
    for (const category of summary.categoryTotals) {
      ensureSpace(24);
      document.font('Helvetica').fontSize(9).fillColor('#202a34').text(`${category.category}: ${money(category.totalsByCurrency)}`);
    }
    const pages = document.bufferedPageRange();
    for (let index = 0; index < pages.count; index += 1) {
      document.switchToPage(pages.start + index);
      document.font('Helvetica').fontSize(8).fillColor('#7b8794')
        .text(`Travel itinerary · ${index + 1} / ${pages.count}`, 52, document.page.height - 34, { align: 'center', width: document.page.width - 104 });
    }
    document.end();
    return finished;
  }

  async getBudgetSummary(id: string, user: JwtUser) {
    const itinerary = await this.getOwnedItinerary(id, user);
    const linkedBookings = await this.loadLinkedFlightBookings(itinerary, user);
    const summary = this.calculateBudgetSummary(itinerary, linkedBookings);
    const currentUser = await this.usersService.findById(user.sub);
    const rawTargetCurrency = currentUser.preferences?.currency;

    if (typeof rawTargetCurrency !== 'string' || rawTargetCurrency.trim() === '') {
      return {
        ...summary,
        conversion: this.unavailableConversion('preferred_currency_missing'),
      };
    }

    const targetCurrency = rawTargetCurrency.trim().toUpperCase();
    if (!(await this.reference.isSupportedCurrency(targetCurrency))) {
      return {
        ...summary,
        conversion: this.unavailableConversion(
          'preferred_currency_unsupported',
          targetCurrency,
        ),
      };
    }

    // Cache failures deliberately propagate as FxCacheDatabaseError. This
    // endpoint never initiates a provider request; the daily scheduler owns it.
    const snapshot = await this.fxService.getLatestCachedSnapshot();
    if (!snapshot) {
      return {
        ...summary,
        conversion: this.unavailableConversion('rates_unavailable', targetCurrency),
      };
    }

    for (const { currency } of summary.totalsByCurrency) {
      if (!(await this.reference.isSupportedCurrency(currency))) {
        return {
          ...summary,
          conversion: this.unavailableConversion(
            'source_currency_unsupported',
            targetCurrency,
          ),
        };
      }
    }

    return {
      ...summary,
      conversion: convertItineraryBudgetSummary(summary, targetCurrency, snapshot),
    };
  }

  private unavailableConversion(
    reason: BudgetConversionUnavailableReason,
    targetCurrency?: string,
  ): ItineraryBudgetConversionDto {
    return {
      status: 'unavailable',
      ...(targetCurrency ? { targetCurrency } : {}),
      reason,
    };
  }

  private calculateBudgetSummary(
    itinerary: ItineraryDocument | Record<string, any>,
    linkedBookings: Map<number, ItineraryLinkedBookingDto[]> = new Map(),
  ): RawItineraryBudgetSummaryDto {
    type CurrencyTotals = Map<string, number>;
    type CategoryTotals = Record<ItineraryBudgetSummaryCategory, CurrencyTotals>;
    type DayAccumulator = {
      source: Record<string, any>;
      dayOrder: number;
      date: string;
      cityId: string | null;
      totals: CurrencyTotals;
      categories: CategoryTotals;
      linkedBookings: ItineraryLinkedBookingDto[];
    };
    type LegacyBucket = {
      amount: number;
      entries: UnassignedLegacyBudgetEntryDto[];
    };

    const newCategoryTotals = (): CategoryTotals =>
      Object.fromEntries(
        ITINERARY_BUDGET_SUMMARY_CATEGORIES.map((category) => [category, new Map<string, number>()]),
      ) as CategoryTotals;
    const addAmount = (totals: CurrencyTotals, currency: string, amount: number) => {
      totals.set(currency, (totals.get(currency) ?? 0) + amount);
    };
    const currencyAmounts = (totals: CurrencyTotals) =>
      [...totals.entries()]
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([currency, amount]) => ({ currency, amount }));
    const categories = (totals: CategoryTotals) =>
      ITINERARY_BUDGET_SUMMARY_CATEGORIES.map((category) => ({
        category,
        totalsByCurrency: currencyAmounts(totals[category]),
      }));

    const source =
      typeof (itinerary as ItineraryDocument).toObject === 'function'
        ? (itinerary as ItineraryDocument).toObject()
        : itinerary;
    const orderedDays = (source.days ?? [])
      .map((day: Record<string, any>, index: number) => ({ day, index }))
      .sort((left: any, right: any) => left.day.order - right.day.order || left.index - right.index)
      .map(({ day }: { day: Record<string, any> }) => day);
    const overallTotals: CurrencyTotals = new Map();
    const overallCategories = newCategoryTotals();
    const dayRows: DayAccumulator[] = orderedDays.map((day: Record<string, any>) => {
      const date = this.tryDateOnlyUtc(day.date);
      if (!date) throw new ConflictException('Stored itinerary day date is invalid');
      return {
        source: day,
        dayOrder: day.order,
        date,
        cityId: typeof day.cityId === 'string' && day.cityId.trim() !== ''
          ? day.cityId
          : null,
        totals: new Map(),
        categories: newCategoryTotals(),
        linkedBookings: linkedBookings.get(day.order) ?? [],
      };
    });

    const addExpense = (
      category: ItineraryBudgetSummaryCategory,
      rawCurrency: unknown,
      rawAmount: unknown,
      day?: DayAccumulator,
    ) => {
      if (!ITINERARY_BUDGET_SUMMARY_CATEGORIES.includes(category)) {
        throw new ConflictException('Stored itinerary budget category is invalid');
      }
      if (typeof rawCurrency !== 'string' || rawCurrency.trim() === '') {
        throw new ConflictException('Stored itinerary budget currency is invalid');
      }
      if (typeof rawAmount !== 'number' || !Number.isFinite(rawAmount) || rawAmount < 0) {
        throw new ConflictException('Stored itinerary budget amount is invalid');
      }
      const currency = rawCurrency.trim().toUpperCase();
      addAmount(overallTotals, currency, rawAmount);
      addAmount(overallCategories[category], currency, rawAmount);
      if (day) {
        addAmount(day.totals, currency, rawAmount);
        addAmount(day.categories[category], currency, rawAmount);
      }
      return currency;
    };

    for (const day of dayRows) {
      for (const entry of day.source.budgetEntries ?? []) {
        addExpense(entry.category, entry.currency, entry.amount, day);
      }
      for (const activity of day.source.activities ?? []) {
        if (activity.cost !== undefined && activity.cost !== null) {
          addExpense('activities', activity.cost.currency, activity.cost.amount, day);
        }
      }
      for (const entry of day.source.transportEntries ?? []) {
        addExpense('intercity_transportation', entry.currency, entry.amount, day);
      }
      for (const booking of day.linkedBookings) {
        if (booking.includedInBudget && booking.amount !== undefined && booking.currency) {
          addExpense('intercity_transportation', booking.currency, booking.amount, day);
        }
      }
    }

    const unassignedLegacy = new Map<string, LegacyBucket>();
    for (const entry of source.budgetEntries ?? []) {
      const entryDate = this.tryDateOnlyUtc(entry.date);
      const matchingDays = entryDate
        ? dayRows.filter((day) => day.date === entryDate)
        : [];
      const assignedDay = matchingDays.length === 1 ? matchingDays[0] : undefined;
      const currency = addExpense(entry.category, entry.currency, entry.amount, assignedDay);
      if (!assignedDay) {
        const bucket = unassignedLegacy.get(currency) ?? { amount: 0, entries: [] };
        bucket.amount += entry.amount;
        const legacyEntry: UnassignedLegacyBudgetEntryDto = {
          category: entry.category,
          amount: entry.amount,
          currency,
        };
        if (entry.description !== undefined) legacyEntry.description = entry.description;
        if (entryDate) legacyEntry.date = entryDate;
        bucket.entries.push(legacyEntry);
        unassignedLegacy.set(currency, bucket);
      }
    }

    // Derive groups only after all expense sources have been attributed to day
    // rows. Null-city days remain individual groups so their expenses reconcile
    // with itinerary totals without guessing a city or merging unknown days.
    const cityGroups: Array<{
      cityId: string | null;
      startDayOrder: number;
      endDayOrder: number;
      dayCount: number;
      totals: CurrencyTotals;
    }> = [];
    for (const day of dayRows) {
      const previous = cityGroups[cityGroups.length - 1];
      if (
        day.cityId !== null &&
        previous?.cityId === day.cityId &&
        previous.endDayOrder + 1 === day.dayOrder
      ) {
        previous.endDayOrder = day.dayOrder;
        previous.dayCount += 1;
        for (const [currency, amount] of day.totals) {
          addAmount(previous.totals, currency, amount);
        }
      } else {
        cityGroups.push({
          cityId: day.cityId,
          startDayOrder: day.dayOrder,
          endDayOrder: day.dayOrder,
          dayCount: 1,
          totals: new Map(day.totals),
        });
      }
    }

    return {
      itineraryId: String(source._id),
      totalsByCurrency: currencyAmounts(overallTotals),
      categoryTotals: categories(overallCategories),
      dayTotals: dayRows.map((day) => ({
        dayOrder: day.dayOrder,
        date: day.date,
        cityId: day.cityId,
        totalsByCurrency: currencyAmounts(day.totals),
        categoryTotals: categories(day.categories),
        linkedBookings: day.linkedBookings,
      })),
      cityGroups: cityGroups.map((group) => ({
        cityId: group.cityId,
        startDayOrder: group.startDayOrder,
        endDayOrder: group.endDayOrder,
        dayCount: group.dayCount,
        totalsByCurrency: currencyAmounts(group.totals),
      })),
      unassignedLegacyByCurrency: [...unassignedLegacy.entries()]
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([currency, bucket]) => ({ currency, ...bucket })),
    };
  }

  private tryDateOnlyUtc(value: unknown): string | undefined {
    if (!(value instanceof Date) && typeof value !== 'string' && typeof value !== 'number') {
      return undefined;
    }
    const date = value instanceof Date ? new Date(value) : new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    return date.toISOString().slice(0, 10);
  }

  private bookingPrincipal(user: JwtUser): P2Principal {
    if (user.role !== Role.USER) {
      throw new ForbiddenException('Only registered users can associate flight bookings');
    }
    return { id: user.sub, roles: ['user'], airlineIds: [] };
  }

  private parseObjectId(value: unknown, name: string): Types.ObjectId {
    if (typeof value !== 'string' || !Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`Invalid ${name} ID`);
    }
    return new Types.ObjectId(value);
  }

  private flightLocalDate(leg: any): string | undefined {
    if (!(leg?.departureAt instanceof Date) || typeof leg.departureTimeZone !== 'string') return undefined;
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: leg.departureTimeZone,
        year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(leg.departureAt);
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      return `${values.year}-${values.month}-${values.day}`;
    } catch {
      return undefined;
    }
  }

  private async loadLinkedFlightBookings(
    itinerary: ItineraryDocument | Record<string, any>,
    user: JwtUser,
  ): Promise<Map<number, ItineraryLinkedBookingDto[]>> {
    const source = typeof (itinerary as ItineraryDocument).toObject === 'function'
      ? (itinerary as ItineraryDocument).toObject()
      : itinerary as Record<string, any>;
    const result = new Map<number, ItineraryLinkedBookingDto[]>();
    const seenBookingIds = new Set<string>();
    for (const day of source.days ?? []) {
      const dayDate = this.tryDateOnlyUtc(day.date);
      const rows: ItineraryLinkedBookingDto[] = [];
      for (const association of day.bookingAssociations ?? []) {
        const bookingId = String(association.bookingId);
        if (seenBookingIds.has(bookingId)) {
          rows.push({ type: 'flight', bookingId, status: 'duplicate_association', includedInBudget: false });
          continue;
        }
        seenBookingIds.add(bookingId);
        try {
          const booking: any = await this.flightBookings.get(bookingId, this.bookingPrincipal(user));
          const dateMatches = Boolean(dayDate && (booking.legs ?? []).some((leg: any) => this.flightLocalDate(leg) === dayDate));
          const includedInBudget = ['confirmed', 'completed'].includes(booking.status) && dateMatches;
          rows.push({
            type: 'flight',
            bookingId,
            status: booking.status,
            ...(includedInBudget ? {
              amount: this.fromMinorUnits(booking.totalMinor, booking.currency),
              currency: booking.currency,
            } : {}),
            legs: (booking.legs ?? []).map((leg: any) => ({
              flightNumber: leg.flightNumber,
              departureAirport: leg.departureAirport,
              arrivalAirport: leg.arrivalAirport,
              departureAt: leg.departureAt,
              arrivalAt: leg.arrivalAt,
            })),
            includedInBudget,
          });
        } catch (error) {
          if (!(error instanceof NotFoundException)) throw error;
          rows.push({ type: 'flight', bookingId, status: 'unavailable', includedInBudget: false });
        }
      }
      result.set(day.order, rows);
    }
    return result;
  }

  private fromMinorUnits(amount: number, currency: string): number {
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new ConflictException('Stored flight booking amount is invalid');
    }
    let fractionDigits: number | undefined;
    try {
      fractionDigits = new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
    } catch {
      throw new ConflictException('Stored flight booking currency is invalid');
    }
    if (!Number.isInteger(fractionDigits) || fractionDigits! < 0 || fractionDigits! > 6) {
      throw new ConflictException('Stored flight booking currency precision is invalid');
    }
    return amount / (10 ** fractionDigits!);
  }

  private recalculateExistingDayDates(days: any[], startDate: Date) {
    const scheduleStart = this.utcDateOnly(startDate);
    return (days ?? [])
      .map((day, index) => ({ day, index }))
      .sort((left, right) => left.day.order - right.day.order || left.index - right.index)
      .map(({ day }, index) => {
        const date = new Date(scheduleStart);
        date.setUTCDate(date.getUTCDate() + index);
        const fields = typeof day.toObject === 'function' ? day.toObject() : { ...day };
        return { ...fields, order: index + 1, date };
      });
  }

  /**
   * Dual-read response projection. Never changes or saves the hydrated document:
   * legacy free-text values are preserved under legacyData without being treated
   * as reference IDs. Canonical fields are always present and are null when the
   * stored document predates them.
   */
  private toResponse(document: ItineraryDocument | Record<string, any>) {
    const source =
      typeof (document as ItineraryDocument).toObject === 'function'
        ? (document as ItineraryDocument).toObject()
        : { ...document };

    const legacyData: Record<string, unknown> = {};
    if (source.destinations !== undefined) {
      legacyData.destinations = source.destinations;
    }

    const days = (source.days ?? []).map((day: Record<string, any>) => {
      const responseDay: Record<string, any> = {
        ...day,
        cityId: day.cityId ?? null,
        bookingAssociations: (day.bookingAssociations ?? []).map((association: any) => ({
          type: association.type,
          bookingId: String(association.bookingId),
        })),
      };
      if (day.city !== undefined) {
        responseDay.legacyData = { ...(responseDay.legacyData ?? {}), city: day.city };
      }
      delete responseDay.city;
      return responseDay;
    });

    const response: Record<string, any> = {
      ...source,
      countryCodes: source.countryCodes ?? null,
      days,
    };
    if (
      source.clonedFromItineraryId !== undefined ||
      source.clonedFromAuthorId !== undefined ||
      source.clonedFromAuthorName !== undefined
    ) {
      response.clonedFrom = {
        itineraryId: source.clonedFromItineraryId === undefined ? undefined : String(source.clonedFromItineraryId),
        authorId: source.clonedFromAuthorId === undefined ? undefined : String(source.clonedFromAuthorId),
        authorName: source.clonedFromAuthorName,
      };
      delete response.clonedFromItineraryId;
      delete response.clonedFromAuthorId;
      delete response.clonedFromAuthorName;
    }
    delete response.destinations;
    // endDate is legacy-only and must not be exposed as an authoritative date.
    delete response.endDate;
    if (Object.keys(legacyData).length > 0) {
      response.legacyData = legacyData;
    }
    return response;
  }

  private assertPositiveDayOrder(dayOrder: number) {
    if (!Number.isSafeInteger(dayOrder) || dayOrder < 1) {
      throw new BadRequestException('dayOrder must be a positive integer');
    }
  }

  private getOrderedDays(days: any[] = []) {
    if (days.length > 60) {
      throw new ConflictException('Stored itinerary exceeds the 60-day limit');
    }
    const ordered = days
      .map((day, index) => ({ day, index }))
      .sort((left, right) => left.day.order - right.day.order || left.index - right.index)
      .map(({ day }) => day);
    const orders = ordered.map((day) => day.order);
    if (
      orders.some((order) => !Number.isSafeInteger(order) || order < 1) ||
      new Set(orders).size !== orders.length
    ) {
      throw new ConflictException('Stored itinerary day ordering is invalid');
    }
    return ordered;
  }

  private applyDaySequence(itinerary: ItineraryDocument, days: any[]) {
    const scheduleStart = this.utcDateOnly(itinerary.startDate);
    days.forEach((day, index) => {
      const date = new Date(scheduleStart);
      date.setUTCDate(date.getUTCDate() + index);
      // Preserve every other field on the original day subdocument.
      day.order = index + 1;
      day.date = date;
    });
    itinerary.days.splice(0, itinerary.days.length, ...days);
  }

  private utcDateOnly(value: Date) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new ConflictException('Itinerary startDate is invalid');
    }
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }
}
