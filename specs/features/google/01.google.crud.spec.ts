describe('Google', () => {
  it('G101_Google: Test search', async () => {
    const search = await $('//*[@name="q"]');
    await search.waitForDisplayed();
    await search.setValue('Demo');
    const key = await search.getValue();
    expect(key).toBe('Demo');
  });
});
