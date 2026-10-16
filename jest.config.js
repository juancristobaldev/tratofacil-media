module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      '../tratofacil-api/node_modules/ts-jest',
      {
        tsconfig: {
          types: ['../tratofacil-api/node_modules/@types/jest', 'node'],
        },
      },
    ],
  },
  testEnvironment: 'node',
};
