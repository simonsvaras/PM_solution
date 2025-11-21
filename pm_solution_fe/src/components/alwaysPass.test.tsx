import { render } from '@testing-library/react'
import {expect} from "vitest";

describe('Always passing test', () => {
    it('should always pass', () => {
        expect(true).toBe(true)
    })

    it('should render component without crashing', () => {
        const TestComponent = () => <div>Hello world</div>
        render(<TestComponent />)
        expect(true).toBeTruthy()
    })
})
