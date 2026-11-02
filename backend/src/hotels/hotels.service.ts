import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isMongoId } from 'class-validator';
import { Model } from 'mongoose';
import { CreateHotelDto } from './dto/create-hotel.dto';
import { UpdateHotelDto } from './dto/update-hotel.dto';
import { Hotel } from './entities/hotel.entity';

@Injectable()
export class HotelsService {
  constructor(
    @InjectModel(Hotel.name)
    private readonly hotelModel: Model<Hotel>,
  ) {}

  create(createHotelDto: CreateHotelDto) {
    return this.hotelModel.create(createHotelDto);
  }

  findAll() {
    return this.hotelModel.find().exec();
  }

  async findOne(id: string) {
    this.validateId(id);

    const hotel = await this.hotelModel.findById(id).exec();

    if (!hotel) {
      throw new NotFoundException('Hotel not found');
    }

    return hotel;
  }

  async update(id: string, updateHotelDto: UpdateHotelDto) {
    this.validateId(id);

    const hotel = await this.hotelModel
      .findByIdAndUpdate(
        id,
        { $set: updateHotelDto },
        { new: true, runValidators: true },
      )
      .exec();

    if (!hotel) {
      throw new NotFoundException('Hotel not found');
    }

    return hotel;
  }

  async remove(id: string) {
    this.validateId(id);

    const hotel = await this.hotelModel.findByIdAndDelete(id).exec();

    if (!hotel) {
      throw new NotFoundException('Hotel not found');
    }

    return { message: 'Hotel deleted successfully' };
  }

  private validateId(id: string) {
    if (!isMongoId(id)) {
      throw new BadRequestException('Invalid hotel ID');
    }
  }
}
