export type BodyId = 'earth' | 'mars' | 'luna' | 'sol'

export type ReferenceFact = {
  field: string
  value: number | string
  unit: string | null
  source_id: string
  source_locator: string
  as_of: string
  scope: string
}

export type ReferenceDataset = {
  body_id: BodyId
  facts: ReferenceFact[]
}
