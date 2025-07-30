export const federationDirectives = `
  directive @key(fields: String!) repeatable on OBJECT | INTERFACE
  directive @shareable on OBJECT | FIELD_DEFINITION
  directive @external on FIELD_DEFINITION
  directive @requires(fields: String!) on FIELD_DEFINITION
  directive @provides(fields: String!) on FIELD_DEFINITION
  directive @extends on OBJECT | INTERFACE
  directive @link(url: String!, import: [String]) on SCHEMA
`;

export interface Context {
  req: Request;
  userId?: string;
  token?: string;
}
