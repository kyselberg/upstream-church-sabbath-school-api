import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, registerDecorator, ValidationOptions } from 'class-validator';

function NotEqualTo(property: string, options?: ValidationOptions) {
  return (target: object, propertyName: string) => {
    registerDecorator({
      name: 'notEqualTo',
      target: target.constructor,
      propertyName,
      constraints: [property],
      options,
      validator: {
        validate(
          value: unknown,
          args?: { constraints: unknown[]; object: unknown },
        ) {
          const [relatedProperty] = args!.constraints as [string];
          return (
            value !== (args!.object as Record<string, unknown>)[relatedProperty]
          );
        },
        defaultMessage(args) {
          const [relatedProperty] = args?.constraints as [string];
          return `${args?.property} must not equal ${relatedProperty}`;
        },
      },
    });
  };
}

export class SwapDto {
  @ApiProperty()
  @IsUUID()
  aId!: string;

  @ApiProperty()
  @IsUUID()
  @NotEqualTo('aId', { message: 'bId must differ from aId' })
  bId!: string;
}
