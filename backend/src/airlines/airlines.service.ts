import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { objectId } from '../p2/access.js';
import { MongoServerError } from 'mongodb';

import { Airline } from './schemas/airline.schema.js';
import { CreateAirlineDto } from './dto/create-airline.dto.js';
import { UpdateAirlineDto } from './dto/update-airline.dto.js';

@Injectable()
export class AirlinesService {
  constructor(
    @InjectModel(Airline.name)
    private readonly airlineModel: Model<Airline>,
  ) {}

  async create(dto: CreateAirlineDto) {
    try {
      return await this.airlineModel.create(dto);
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        throw new ConflictException('Airline already exists');
      }
      throw error;
    }
  }

  async findAll() {
    return this.airlineModel.find().exec();
  }

  async findOne(id: string) {
    objectId(id);

    const airline = await this.airlineModel.findById(id).exec();

    if (!airline) {
      throw new NotFoundException('Airline not found');
    }

    return airline;
  }

  async update(id: string, dto: UpdateAirlineDto) {
    objectId(id);

    try {
      const airline = await this.airlineModel
        .findByIdAndUpdate(id, dto, {
          new: true,
          runValidators: true,
        })
        .exec();

      if (!airline) {
        throw new NotFoundException('Airline not found');
      }

      return airline;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        throw new ConflictException('Airline already exists');
      }
      throw error;
    }
  }

  async setPolicy(
    id: string,
    key: 'baggagePolicy' | 'cancellationPolicy',
    policy: object,
  ) {
    const airline = await this.airlineModel
      .findByIdAndUpdate(
        objectId(id),
        { $set: { [key]: policy } },
        { new: true, runValidators: true },
      )
      .exec();
    if (!airline) throw new NotFoundException('Airline not found');
    return airline;
  }
}
