import { ValidateResponseDTO } from './validate-response.dto';
import { ValidationResultDTO } from './validation-result.dto';

describe('ValidateResponseDTO', () => {
  const mockValidationResult: ValidationResultDTO = {
    valid_count: 150,
    invalid_count: 2,
    errors: [
      {
        line_number: 10,
        error: 'Montant invalide',
        field: 'amount'
      }
    ]
  };

  it('should create a valid ValidateResponseDTO', () => {
    const response: ValidateResponseDTO = {
      success: true,
      count: 152,
      validation: mockValidationResult
    };

    expect(response.success).toBe(true);
    expect(response.count).toBe(152);
    expect(response.validation).toEqual(mockValidationResult);
  });

  it('should handle successful validation', () => {
    const response: ValidateResponseDTO = {
      success: true,
      count: 200,
      validation: {
        valid_count: 200,
        invalid_count: 0,
        errors: []
      }
    };

    expect(response.success).toBe(true);
    expect(response.validation.invalid_count).toBe(0);
    expect(response.validation.errors).toHaveLength(0);
  });

  it('should handle failed validation', () => {
    const response: ValidateResponseDTO = {
      success: false,
      count: 152,
      validation: mockValidationResult
    };

    expect(response.success).toBe(false);
    expect(response.validation.invalid_count).toBeGreaterThan(0);
  });

  it('should include validation details', () => {
    const response: ValidateResponseDTO = {
      success: true,
      count: 152,
      validation: mockValidationResult
    };

    expect(response.validation.valid_count).toBe(150);
    expect(response.validation.invalid_count).toBe(2);
    expect(response.validation.errors).toHaveLength(1);
  });

  it('should match count with validation totals', () => {
    const response: ValidateResponseDTO = {
      success: true,
      count: 152,
      validation: mockValidationResult
    };

    const validationTotal = response.validation.valid_count + response.validation.invalid_count;
    expect(response.count).toBe(validationTotal);
  });
});
