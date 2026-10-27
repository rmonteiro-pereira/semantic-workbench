/** Example ontology shown when opening an empty workspace. */
/** Small commerce ontology used by the welcome action. */
export const sample = `name: Commerce
ontology:
  - concept: Customer
    type: EntityType
    description: A person who purchases products.
    relationships:
      - name: places
        roles:
          - concept: Order
        verbalizes: ['{Customer} places {Order}']
  - concept: Order
    type: EntityType
    description: A purchase made by a customer.
    relationships:
      - name: contains
        roles:
          - concept: Product
        verbalizes: ['{Order} contains {Product}']
  - concept: Product
    type: EntityType
    description: An item available for purchase.
`;
