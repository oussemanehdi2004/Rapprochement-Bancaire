import { ValidationErrorDTO, ValidationResultDTO } from './validation-result.dto';

describe('ValidationResultDTO', () => {
  const mockErrors: ValidationErrorDTO[] = [
    {
      line_number: 10,
      error: 'Montant invalide',
      field: 'amount'
    },
    {
      line_number: 25,
      error: 'Date manquante',
      field: 'value_date'
    }
  ];

  it('should create a valid ValidationResultDTO', () => {
    const result: ValidationResultDTO = {
      valid_count: 150,
      invalid_count: 2,
      errors: mockErrors
    };

    expect(result.valid_count).toBe(150);
    expect(result.invalid_count).toBe(2);
    expect(result.errors).toHaveLength(2);
  });

  it('should create a valid ValidationErrorDTO', () => {
    const error: ValidationErrorDTO = {
      line_number: 10,
      error: 'Montant invalide',
      field: 'amount'
    };

    expect(error.line_number).toBe(10);
    expect(error.error).toBe('Montant invalide');
    expect(error.field).toBe('amount');
  });

  it('should handle validation with no errors', () => {
    const result: ValidationResultDTO = {
      valid_count: 200,
      invalid_count: 0,
      errors: []
    };

    expect(result.valid_count).toBe(200);
    expect(result.invalid_count).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should calculate total count correctly', () => {
    const result: ValidationResultDTO = {
      valid_count: 150,
      invalid_count: 2,
      errors: mockErrors
    };

    const total = result.valid_count + result.invalid_count;
    expect(total).toBe(152);
  });

  it('should calculate validation success rate', () => {
    const result: ValidationResultDTO = {
      valid_count: 150,
      invalid_count: 2,
      errors: mockErrors
    };

    const total = result.valid_count + result.invalid_count;
    const successRate = (result.valid_count / total) * 100;
    expect(successRate).toBeCloseTo(98.68, 1);
  });

  it('should provide detailed error information', () => {
    const result: ValidationResultDTO = {
      valid_count: 150,
      invalid_count: 2,
      errors: mockErrors
    };

    expect(result.errors[0].line_number).toBe(10);
    expect(result.errors[0].error).toBe('Montant invalide');
    expect(result.errors[0].field).toBe('amount');
    
    expect(result.errors[1].line_number).toBe(25);
    expect(result.errors[1].error).toBe('Date manquante');
    expect(result.errors[1].field).toBe('value_date');
  });
});
