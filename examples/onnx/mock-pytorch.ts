// Mock implementation of js-pytorch for testing

// Mock implementation of js-pytorch for testing
export const nn = {
  Linear: jest.fn().mockImplementation((inputSize: number, outputSize: number) => ({
    inputSize,
    outputSize,
    forward: jest.fn().mockImplementation(x => x),
    to: jest.fn(),
    eval: jest.fn(),
    copy_: jest.fn()
  })),
  ReLU: jest.fn().mockImplementation(() => ({
    forward: jest.fn().mockImplementation(x => x),
    to: jest.fn(),
    eval: jest.fn()
  }))
};

// Create a mock tensor object without recursive calls
const createMockTensor = (data: number[] | Float32Array) => {
  const mockTensor: any = {
    shape: Array.isArray(data) ? [data.length] : [data.byteLength / 4],
    dataSync: jest.fn().mockReturnValue(Array.isArray(data) ? new Float32Array(data) : data),
    backward: jest.fn(),
    copy_: jest.fn(),
  };
  // Use lazy evaluation to avoid infinite recursion
  mockTensor.add = jest.fn().mockImplementation(() => createMockTensor([0]));
  mockTensor.pow = jest.fn().mockImplementation(() => createMockTensor([0]));
  mockTensor.sum = jest.fn().mockImplementation(() => createMockTensor([0]));
  mockTensor.relu = jest.fn().mockImplementation(() => createMockTensor([0]));
  mockTensor.to = jest.fn().mockImplementation(() => mockTensor);
  return mockTensor;
};

export const tensor = jest.fn().mockImplementation((data: number[] | Float32Array, options?: { requiresGrad?: boolean }) =>
  createMockTensor(data)
);

export const device = jest.fn().mockImplementation((type: string) => ({ type }));

export const load = jest.fn().mockImplementation(async (path: string) => ({}));
